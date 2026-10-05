# Third-party notices

Workdesk redistributes Electron/Chromium and an official CPython Windows runtime.
Their licenses and notices are retained in the packaged distribution. The
Python runtime contains public wheel distributions listed in DEPENDENCIES.txt;
their installed *.dist-info license directories remain intact.

- Electron: https://github.com/electron/electron/blob/main/LICENSE
- CPython: https://docs.python.org/3/license.html
- Playwright/Chromium: browser runtime LICENSE/NOTICE files are included.
- PyAV: https://github.com/PyAV-Org/PyAV/blob/main/LICENSE.txt
  Its Windows wheels include GPL-enabled FFmpeg libraries. Those wheels and
  libraries are explicitly excluded from the Workdesk installer. On first video
  use, the user obtains av==18.0.0 directly from PyPI in a separate local component
  directory. This is a runtime prerequisite, not a Workdesk binary redistribution.
  Upstream build/source: https://github.com/PyAV-Org/pyav-ffmpeg .
- faster-whisper: https://github.com/SYSTRAN/faster-whisper/blob/master/LICENSE
- Lucide icons: original files, license and source checksums are in
  backend/static/icons/. Icons retain their original geometry. The desktop icon
  uses the Lucide layout-dashboard icon over a neutral background.

No personal media, cookies, account authorizations, ASR model weights or API keys
are distributed. Whisper model weights are downloaded separately on demand from
the configured provider.
