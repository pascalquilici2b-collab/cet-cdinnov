"""Install the verified veraPDF distribution in a Linux container."""
from pathlib import Path
import hashlib
import subprocess
import tempfile
import urllib.request
import zipfile

URL = 'https://software.verapdf.org/releases/1.30/verapdf-greenfield-1.30.2-installer.zip'
SHA256 = '6cc6341cb1af644044054b81f00a6590a7918abb18f762243de115258bcad838'


def main():
    with tempfile.TemporaryDirectory(prefix='verapdf-install-') as temp:
        work = Path(temp)
        with urllib.request.urlopen(URL, timeout=120) as response:
            archive = response.read()
        if hashlib.sha256(archive).hexdigest() != SHA256:
            raise RuntimeError('Unexpected veraPDF installer checksum.')
        source = work / 'installer.zip'
        source.write_bytes(archive)
        with zipfile.ZipFile(source) as zipped:
            zipped.extractall(work / 'installer')
        config = work / 'install.xml'
        config.write_text('''<AutomatedInstallation langpack="eng">
<com.izforge.izpack.panels.htmlhello.HTMLHelloPanel id="welcome"/>
<com.izforge.izpack.panels.target.TargetPanel id="install_dir"><installpath>/opt/verapdf</installpath></com.izforge.izpack.panels.target.TargetPanel>
<com.izforge.izpack.panels.packs.PacksPanel id="sdk_pack_select"><pack index="0" name="veraPDF GUI" selected="true"/><pack index="1" name="veraPDF Mac and *nix Scripts" selected="true"/><pack index="2" name="veraPDF Validation model" selected="false"/><pack index="3" name="veraPDF Documentation" selected="false"/><pack index="4" name="veraPDF Sample Plugins" selected="false"/></com.izforge.izpack.panels.packs.PacksPanel>
<com.izforge.izpack.panels.install.InstallPanel id="install"/><com.izforge.izpack.panels.finish.FinishPanel id="finish"/>
</AutomatedInstallation>''', encoding='utf-8')
        installer = work / 'installer/verapdf-greenfield-1.30.2/verapdf-izpack-installer-1.30.2.jar'
        subprocess.run(['/usr/bin/java', '-jar', str(installer), str(config)], check=True, timeout=180)
        if not Path('/opt/verapdf/bin/cli-1.30.2.jar').is_file():
            raise RuntimeError('veraPDF CLI missing after installation.')


if __name__ == '__main__':
    main()
