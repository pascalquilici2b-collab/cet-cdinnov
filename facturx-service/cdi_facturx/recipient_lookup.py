"""Public company identity lookup. This source never verifies invoice routing."""
from collections import OrderedDict
from copy import deepcopy
from datetime import datetime, timezone
import re
import threading
import time

import httpx
from pydantic import BaseModel, ConfigDict, Field
from stdnum.fr import siren, siret


SEARCH_URL = 'https://recherche-entreprises.api.gouv.fr/search'
DIRECTORY_URL = 'https://facturation.chorus-pro.gouv.fr/annuaire/#/'
_cache = OrderedDict()
_lock = threading.Lock()
_slots = threading.BoundedSemaphore(2)


class RecipientQuery(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    query: str = Field(min_length=3, max_length=200)
    country: str = Field(default='FR', pattern=r'^[A-Z]{2}$')


class LookupError(Exception):
    def __init__(self, message, status=503):
        super().__init__(message)
        self.status = status


def text(value, limit=250):
    return re.sub(r'\s+', ' ', str(value or '')).strip()[:limit]


def normalise_results(data, query):
    """Return only public identity/address fields, never officers or routing guesses."""
    if not isinstance(data, dict) or not isinstance(data.get('results'), list):
        raise LookupError('La réponse de l’annuaire est illisible. Réessayez plus tard.')
    candidates, seen, more_establishments = [], set(), False
    identifier = re.sub(r'\s', '', query)
    for company in data['results'][:5]:
        if not isinstance(company, dict):
            continue
        company_id = text(company.get('siren'))
        if not siren.is_valid(company_id) or company.get('etat_administratif') != 'A':
            continue
        if identifier.isdigit() and company_id != identifier[:9]:
            continue
        name = text(company.get('nom_raison_sociale') or company.get('nom_complet'))
        headquarters = company.get('siege') or {}
        matching = company.get('matching_etablissements') or []
        establishments = [headquarters] + (matching[:10] if isinstance(matching, list) else [])
        count = company.get('nombre_etablissements_ouverts')
        if isinstance(count, int) and count > len(establishments):
            more_establishments = True
        for establishment in establishments:
            if not isinstance(establishment, dict):
                continue
            site_id = text(establishment.get('siret'))
            if (not siret.is_valid(site_id) or not site_id.startswith(company_id)
                    or site_id in seen or establishment.get('etat_administratif') != 'A'
                    or establishment.get('statut_diffusion_etablissement') not in (None, 'O')
                    or establishment.get('code_pays_etranger')):
                continue
            if identifier.isdigit() and len(identifier) == 14 and site_id != identifier:
                continue
            postal = text(establishment.get('code_postal'))
            city = text(establishment.get('libelle_commune'))
            if not re.fullmatch(r'\d{5}', postal) or not city or not name:
                continue
            street = ' '.join(filter(None, (text(establishment.get(key)) for key in
                ('numero_voie', 'indice_repetition', 'type_voie', 'libelle_voie'))))
            if not street:
                address = text(establishment.get('adresse'))
                suffix = re.search(r'\b' + re.escape(postal) + r'\s+' + re.escape(city) + r'$', address, re.I)
                if suffix:
                    street = address[:suffix.start()].strip()
            if not street:
                continue
            seen.add(site_id)
            candidates.append({'name': name, 'siren': company_id, 'siret': site_id,
                'street': street, 'postal_code': postal, 'city': city, 'country': 'FR',
                'is_headquarters': establishment.get('est_siege') is True,
                'company_url': 'https://annuaire-entreprises.data.gouv.fr/etablissement/' + site_id})
    total = data.get('total_results')
    return {'candidates': candidates[:20],
        'exact_match': len(identifier) == 14 and identifier.isdigit() and len(candidates) == 1,
        'has_more': len(candidates) > 20 or (isinstance(total, int) and total > 5)
                    or (len(identifier) != 14 and more_establishments),
        'source': {'name': 'Annuaire des entreprises', 'url': 'https://annuaire-entreprises.data.gouv.fr',
                   'checked_at': datetime.now(timezone.utc).isoformat()},
        'routing': {'status': 'not_connected', 'url': DIRECTORY_URL}}


def lookup_recipient(request: RecipientQuery):
    if request.country != 'FR':
        raise LookupError('La recherche automatique concerne les destinataires français.', 422)
    query = request.query.strip()
    identifier = re.sub(r'\s', '', query)
    if identifier.isdigit():
        valid = (len(identifier) == 9 and siren.is_valid(identifier)) or (len(identifier) == 14 and siret.is_valid(identifier))
        if not valid:
            raise LookupError('Vérifiez le SIREN (9 chiffres) ou le SIRET (14 chiffres).', 422)
        query = identifier
    key = query.casefold()
    with _lock:
        entry = _cache.get(key)
        if entry and time.monotonic() - entry[0] < 300:
            _cache.move_to_end(key)
            return deepcopy(entry[1])
    if not _slots.acquire(blocking=False):
        raise LookupError('Une recherche est déjà en cours. Réessayez dans quelques secondes.')
    try:
        with httpx.Client(timeout=httpx.Timeout(12, connect=5), follow_redirects=False) as client:
            with client.stream('GET', SEARCH_URL, params={'q': query, 'page': 1, 'per_page': 5,
                    'minimal': 'true', 'include': 'siege,matching_etablissements',
                    'limite_matching_etablissements': 10},
                    headers={'Accept': 'application/json', 'User-Agent': 'CDInnov-FacturX/1.0'}) as response:
                if response.status_code != 200:
                    raise LookupError('L’annuaire est momentanément indisponible. Réessayez plus tard.')
                payload = bytearray()
                for chunk in response.iter_bytes():
                    payload.extend(chunk)
                    if len(payload) > 2_000_000:
                        raise LookupError('La réponse de l’annuaire est trop volumineuse. Recherchez avec le SIRET.')
        import json
        result = normalise_results(json.loads(payload), query)
        with _lock:
            _cache[key] = (time.monotonic(), result)
            _cache.move_to_end(key)
            while len(_cache) > 128:
                _cache.popitem(last=False)
        return deepcopy(result)
    except (httpx.HTTPError, ValueError) as exc:
        raise LookupError('La recherche n’a pas abouti. Vérifiez la connexion et réessayez.') from exc
    finally:
        _slots.release()
