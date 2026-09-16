FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    FACTURX_DEPLOYMENT=server \
    FACTURX_GHOSTSCRIPT=/usr/bin/gs \
    FACTURX_ICC=/usr/share/color/icc/ghostscript/srgb.icc \
    FACTURX_JAVA=/usr/bin/java \
    FACTURX_VERAPDF_JAR=/opt/verapdf/bin/cli-1.30.2.jar \
    JAVA_TOOL_OPTIONS=-Xmx192m \
    FACTURX_MAX_CONCURRENCY=1 \
    PORT=8080

RUN apt-get update \
    && apt-get install -y --no-install-recommends ghostscript openjdk-17-jre-headless fonts-dejavu-core ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements-lock.txt ./requirements-lock.txt
RUN pip install --no-cache-dir -r requirements-lock.txt
COPY deployment/install_verapdf.py /tmp/install_verapdf.py
RUN python /tmp/install_verapdf.py && rm /tmp/install_verapdf.py

COPY cdi_facturx ./cdi_facturx
COPY deployment/start_server.py ./deployment/start_server.py
COPY deployment/verify_runtime.py ./deployment/verify_runtime.py
RUN groupadd --gid 10001 facturx \
    && useradd --uid 10001 --gid facturx --no-create-home --shell /usr/sbin/nologin facturx
USER 10001:10001
RUN python -m deployment.verify_runtime
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import json,os,urllib.request; r=json.load(urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8080')+'/api/health',timeout=4)); assert r['ready']"
CMD ["python", "deployment/start_server.py"]
