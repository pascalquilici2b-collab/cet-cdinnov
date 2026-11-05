/** Generic suggestions drawn from locally reviewed assignment letters.
 * A project function is chosen explicitly; an employee's job title is not a match rule.
 * Individual names, client documents and source paths stay outside this catalogue.
 */
export interface MissionProfile {
  id: string;
  label: string;
  aliases: readonly string[];
  tasks: readonly string[];
}

export const MISSION_PROFILES: readonly MissionProfile[] = [
  {
    id: 'chef-projet', label: 'Chef de projet', aliases: ['Cheffe de projet'],
    tasks: [
      'Assurer la coordination globale du projet et superviser la bonne exécution des activités techniques, administratives et financières.',
      'Préparer et participer aux réunions de travail, aux événements et aux comités de pilotage du projet.',
      'Assurer les échanges entre l’organisme, le chef de file et les partenaires du projet.',
      'Suivre le budget du projet et les dépenses, en lien avec le service financier.',
      'Préparer les rapports d’avancement techniques et financiers du projet avec les services concernés et l’assistance à maîtrise d’ouvrage.',
      'Participer à la conception et à la validation des livrables du projet.',
    ],
  },
  {
    id: 'coordination', label: 'Coordinateur de projet', aliases: ['Coordinateur', 'Coordinatrice'],
    tasks: [
      'Préparer et participer aux réunions de travail, aux événements et aux comités de pilotage du projet.',
      'Coordonner et réaliser les travaux techniques liés aux activités du projet.',
      'Consolider et diffuser les informations sur l’avancement du projet auprès des parties prenantes.',
      'Préparer et présenter les rapports d’avancement techniques et financiers du projet lors des comités de pilotage.',
      'Suivre les livrables produits dans le cadre du projet.',
    ],
  },
  {
    id: 'responsable-technique', label: 'Responsable technique', aliases: ['Référent technique', 'Référente technique'],
    tasks: [
      'Superviser les activités techniques du projet.',
      'Participer à la conception et à la validation des livrables techniques du projet.',
      'Suivre les indicateurs du projet.',
      'Préparer et participer aux réunions de travail, aux événements et aux comités de pilotage du projet.',
      'Assurer les échanges techniques entre l’organisme, le chef de file et les partenaires du projet.',
      'Contribuer aux rapports d’avancement du projet en lien avec l’assistance à maîtrise d’ouvrage.',
    ],
  },
  {
    id: 'responsable-administratif', label: 'Responsable administratif', aliases: ['Responsable administrative'],
    tasks: [
      'Préparer et participer aux réunions de travail et aux comités de pilotage du projet.',
      'Coordonner les travaux et les échanges nécessaires à la mise en œuvre du projet.',
      'Assurer l’interface administrative et financière du projet avec le service financier : budget, demandes d’avance et rapports aux instances délibérantes.',
      'Préparer les rapports d’avancement du projet en lien avec l’assistance à maîtrise d’ouvrage.',
      'Appuyer la préparation des audits administratifs et financiers du projet.',
    ],
  },
  {
    id: 'responsable-administratif-financier', label: 'Responsable administratif et financier', aliases: ['Responsable administrative et financière', 'Référent administratif et financier', 'Référente administrative et financière', 'Financial Manager'],
    tasks: [
      'Assurer les échanges entre la direction et l’autorité de gestion concernant les conventions et les questions administratives et financières du projet.',
      'Gérer les obligations administratives et financières du projet et préparer les remontées de dépenses à partir des éléments transmis par les équipes opérationnelles.',
      'Assurer le suivi budgétaire du projet avec le service financier et préparer les rapports aux instances délibérantes.',
      'Préparer les marchés et assurer les échanges avec les prestataires externes intervenant sur le projet.',
      'Préparer et participer aux réunions de travail et aux comités de pilotage du projet.',
      'Contribuer aux rapports d’avancement techniques et financiers du projet en lien avec l’assistance à maîtrise d’ouvrage.',
    ],
  },
  {
    id: 'assistance-administrative', label: 'Assistant administratif', aliases: ['Assistante administrative', 'Attaché administratif', 'Attachée administrative'],
    tasks: [
      'Préparer et participer aux réunions de travail et aux comités de pilotage du projet.',
      'Suivre et mettre à jour les documents administratifs et financiers du projet : tableaux de bord, rapports, factures et conventions.',
      'Collecter, formaliser et transmettre les éléments nécessaires aux rapports financiers du projet.',
      'Coordonner les échanges de documents, d’informations et de rapports avec les partenaires du projet.',
      'Appuyer la préparation des audits et des contrôles financiers portant sur les dépenses du projet.',
      'Préparer les aspects logistiques et administratifs des événements du projet.',
    ],
  },
  {
    id: 'assistance-technique', label: 'Assistant technique', aliases: ['Assistante technique'],
    tasks: [
      'Préparer et participer aux réunions de travail et aux comités de pilotage du projet.',
      'Coordonner les travaux techniques et suivre la mise en œuvre des opérations du projet.',
      'Contribuer à la préparation des documents techniques et des livrables du projet.',
      'Formaliser et transmettre les éléments nécessaires aux rapports d’activités du projet.',
      'Coordonner les échanges de documents, d’informations et de rapports avec les partenaires du projet.',
    ],
  },
  {
    id: 'communication', label: 'Responsable communication', aliases: ['Communication', 'Communication omnicanale'],
    tasks: [
      'Créer et diffuser les contenus valorisant les activités et les résultats du projet : articles, communiqués, supports visuels, newsletters et publications numériques.',
      'Coordonner la communication du projet avec les partenaires, les institutions et les médias.',
      'Préparer les événements du projet, leurs supports de communication et leur couverture médiatique.',
      'Suivre la visibilité du projet et mettre à jour le site internet, les outils numériques et les supports de communication.',
      'Participer aux réunions de coordination du projet pour articuler les actions techniques et la communication.',
      'Contribuer aux rapports d’avancement du projet pour la communication, la diffusion et la valorisation des résultats.',
    ],
  },
  {
    id: 'coordination-evenementielle', label: 'Coordinateur événementiel', aliases: ['Coordinatrice événementielle', 'Coordinateur évènementiel'],
    tasks: [
      'Préparer et participer aux réunions de travail, aux événements et aux comités de pilotage du projet.',
      'Consolider et diffuser les informations sur l’avancement du projet auprès des parties prenantes.',
      'Suivre les livrables produits dans le cadre du projet.',
    ],
  },
  {
    id: 'charge-mission', label: 'Chargé de mission', aliases: ['Chargée de mission'],
    tasks: [
      'Animer les activités techniques du projet en lien avec sa coordination.',
      'Contribuer aux opérations prévues dans le formulaire du projet.',
      'Élaborer les livrables techniques du projet en lien avec les spécialistes concernés et contribuer aux livrables transversaux.',
      'Participer aux actions de sensibilisation et de communication du projet.',
    ],
  },
  {
    id: 'suivi-scientifique', label: 'Suivi scientifique et de terrain', aliases: ['Entomologiste', 'Entomologiste médicale'],
    tasks: [
      'Coordonner, mettre en place, suivre et analyser les actions scientifiques relevant du projet.',
      'Participer aux activités techniques et aux suivis de terrain prévus dans le projet.',
      'Préparer et participer aux réunions de travail, aux événements et aux comités de pilotage du projet.',
    ],
  },
  {
    id: 'mediation-scientifique', label: 'Médiation scientifique', aliases: ['Médiatrice scientifique', 'Médiateur scientifique'],
    tasks: [
      'Animer les réseaux de surveillance et les échanges autour des thématiques scientifiques du projet.',
      'Proposer des activités de sensibilisation sur les réseaux sociaux dans le cadre du projet.',
      'Participer aux journées de sensibilisation liées au projet.',
      'Élaborer une newsletter périodique du projet.',
      'Préparer et participer aux réunions de travail, aux événements et aux comités de pilotage du projet.',
    ],
  },
];

/** An unknown/legacy id deliberately produces no proposed tasks. */
export function missionTasksForProfile(id: string, projectName?: string): string {
  const profile = MISSION_PROFILES.find(item => item.id === id);
  if (!profile) return '';
  const name = projectName?.replace(/\s+/g, ' ').trim();
  return profile.tasks.map(task => '- ' + (name
    ? task.replace(/\b(du|le|au) projet\b/g, (_, article: string) => article + ' projet « ' + name + ' »')
    : task)).join('\n');
}
