const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const dotenv = require('dotenv');

const execFileAsync = promisify(execFile);
const BACKEND_DIR = path.resolve(__dirname, '..');

dotenv.config({
  path: path.join(BACKEND_DIR, '.env'),
  quiet: true
});

const API_BASE =
  process.env.MAVTRACK_PRODUCTION_API ||
  'https://maverick-1z64.onrender.com';

const ADMIN_EMAIL = String(
  process.env.ADMIN_EMAIL || ''
).trim().toLowerCase();

const ADMIN_PASSWORD = String(
  process.env.ADMIN_PASSWORD || ''
);

let authToken = '';

const ARDUINO_CLI = String(
  process.env.MAV2_ARDUINO_CLI ||
  'C:\\Program Files\\Arduino IDE\\resources\\app\\lib\\backend\\resources\\arduino-cli.exe'
);

const POLL_MS = Math.max(
  5000,
  Number(
    process.env.MAV2_COMPILER_POLL_MS ||
    10000
  )
);

const LOCK_PATH = path.join(
  os.tmpdir(),
  'mavtrack-mav2-compiler-agent.lock'
);

function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

function log(message) {
  process.stdout.write(
    `[${new Date().toISOString()}] ${message}\n`
  );
}

async function ensureSingleInstance() {
  try {
    const pid = Number(
      (
        await fsp.readFile(
          LOCK_PATH,
          'utf8'
        )
      ).trim()
    );

    if (
      Number.isInteger(pid) &&
      pid > 0
    ) {
      try {
        process.kill(pid, 0);

        throw new Error(
          `MAV2 Compiler Agent is already running as PID ${pid}`
        );
      } catch (error) {
        if (
          error &&
          error.code !== 'ESRCH'
        ) {
          throw error;
        }
      }
    }
  } catch (error) {
    if (
      error &&
      error.code !== 'ENOENT'
    ) {
      throw error;
    }
  }

  await fsp.writeFile(
    LOCK_PATH,
    String(process.pid),
    'utf8'
  );

  const cleanup = () => {
    try {
      const current =
        fs.readFileSync(
          LOCK_PATH,
          'utf8'
        ).trim();

      if (
        current ===
        String(process.pid)
      ) {
        fs.unlinkSync(
          LOCK_PATH
        );
      }
    } catch {}
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });
}

async function loginAdmin() {
  const response =
    await fetch(
      API_BASE +
        '/api/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json'
        },
        body: JSON.stringify({
          email:
            ADMIN_EMAIL,
          password:
            ADMIN_PASSWORD
        })
      }
    );

  const body =
    await response.json()
      .catch(() => null);

  if (
    !response.ok ||
    !body?.ok ||
    !body?.token
  ) {
    throw new Error(
      body?.message ||
      `Admin login failed HTTP ${response.status}`
    );
  }

  authToken =
    body.token;

  log(
    `Authenticated as ${body.user?.role || 'admin'}`
  );
}

async function apiFetch(
  pathname,
  options = {},
  retryAuth = true
) {
  if (!authToken) {
    await loginAdmin();
  }

  const response =
    await fetch(
      API_BASE + pathname,
      {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization:
            `Bearer ${authToken}`
        }
      }
    );

  if (
    response.status === 401 &&
    retryAuth
  ) {
    authToken = '';
    await loginAdmin();

    return apiFetch(
      pathname,
      options,
      false
    );
  }

  const text =
    await response.text();

  let body = null;

  if (text) {
    try {
      body =
        JSON.parse(text);
    } catch {
      throw new Error(
        `MAVTRACK returned non-JSON HTTP ${response.status}`
      );
    }
  }

  if (!response.ok) {
    throw new Error(
      body?.message ||
      `MAVTRACK HTTP ${response.status}`
    );
  }

  return body;
}

async function getNextJob() {
  const body =
    await apiFetch(
      '/api/mav2/compiler/jobs/next'
    );

  return body?.job || null;
}

async function sendFailed(
  jobId,
  compileLog
) {
  await apiFetch(
    `/api/mav2/compiler/jobs/${jobId}/result`,
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/json'
      },
      body: JSON.stringify({
        status: 'FAILED',
        compileLog:
          String(
            compileLog ||
            'Compilation failed'
          ).slice(-12000)
      })
    }
  );
}

async function sendReady(
  jobId,
  binary,
  compileLog
) {
  const sha256 =
    crypto
      .createHash('sha256')
      .update(binary)
      .digest('hex');

  return apiFetch(
    `/api/mav2/compiler/jobs/${jobId}/result`,
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/json'
      },
      body: JSON.stringify({
        status: 'READY',
        binaryBase64:
          binary.toString(
            'base64'
          ),
        sha256,
        binarySize:
          binary.length,
        compileLog:
          String(
            compileLog || ''
          ).slice(-12000)
      })
    }
  );
}

function injectVersion(
  sketchSource,
  version
) {
  const pattern =
    /const\s+char\s*\*\s*FIRMWARE_VERSION\s*=\s*"[^"]*"\s*;/;

  if (!pattern.test(sketchSource)) {
    throw new Error(
      'Sketch is missing FIRMWARE_VERSION declaration'
    );
  }

  return sketchSource.replace(
    pattern,
    `const char* FIRMWARE_VERSION = "${version}";`
  );
}

async function compileJob(job) {
  if (
    !fs.existsSync(
      ARDUINO_CLI
    )
  ) {
    throw new Error(
      `Arduino CLI not found at ${ARDUINO_CLI}`
    );
  }

  const root =
    await fsp.mkdtemp(
      path.join(
        os.tmpdir(),
        'mavtrack-mav2-build-'
      )
    );

  const sketchDir =
    path.join(
      root,
      'MAV2_REMOTE'
    );

  const outputDir =
    path.join(
      root,
      'out'
    );

  try {
    await Promise.all([
      fsp.mkdir(
        sketchDir,
        {
          recursive: true
        }
      ),
      fsp.mkdir(
        outputDir,
        {
          recursive: true
        }
      )
    ]);

    const source =
      injectVersion(
        String(
          job.sketchSource ||
          ''
        ),
        String(job.version)
      );

    await fsp.writeFile(
      path.join(
        sketchDir,
        'MAV2_REMOTE.ino'
      ),
      source,
      'utf8'
    );

    log(
      `Compiling firmware ${job.version} (job ${job.id})...`
    );

    const result =
      await execFileAsync(
        ARDUINO_CLI,
        [
          'compile',
          '--fqbn',
          job.fqbn ||
            'esp32:esp32:esp32s3',
          '--output-dir',
          outputDir,
          sketchDir
        ],
        {
          timeout:
            15 * 60 * 1000,
          maxBuffer:
            20 * 1024 * 1024
        }
      );

    const files =
      await fsp.readdir(
        outputDir
      );

    const appBinName =
      files.find(
        (name) =>
          name.endsWith(
            '.ino.bin'
          ) &&
          !name.includes(
            'bootloader'
          ) &&
          !name.includes(
            'partitions'
          )
      ) ||
      files.find(
        (name) =>
          name.endsWith('.bin') &&
          !name.includes(
            'bootloader'
          ) &&
          !name.includes(
            'partitions'
          )
      );

    if (!appBinName) {
      throw new Error(
        'Arduino CLI completed but no application .bin was produced'
      );
    }

    const binary =
      await fsp.readFile(
        path.join(
          outputDir,
          appBinName
        )
      );

    if (
      binary.length < 10000 ||
      binary[0] !== 0xE9
    ) {
      throw new Error(
        'Compiled file is not a valid ESP32 application image'
      );
    }

    const compileLog =
      [
        result.stdout || '',
        result.stderr || ''
      ]
        .filter(Boolean)
        .join('\n');

    const uploaded =
      await sendReady(
        job.id,
        binary,
        compileLog
      );

    log(
      `READY v${job.version} · ${uploaded.binarySize || binary.length} bytes · SHA256 ${String(uploaded.sha256 || '').slice(0, 16)}...`
    );
  } finally {
    await fsp.rm(
      root,
      {
        recursive: true,
        force: true
      }
    ).catch(() => {});
  }
}

async function run() {
  if (
    !ADMIN_EMAIL ||
    !ADMIN_PASSWORD
  ) {
    throw new Error(
      'ADMIN_EMAIL / ADMIN_PASSWORD are not configured in backend/.env'
    );
  }

  await ensureSingleInstance();

  log(
    `MAV2 Compiler Agent started · poll ${POLL_MS} ms`
  );

  while (true) {
    let job = null;

    try {
      job =
        await getNextJob();

      if (job) {
        try {
          await compileJob(job);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.stack ||
                error.message
              : String(error);

          log(
            `FAILED job ${job.id}: ${String(message).split('\n')[0]}`
          );

          try {
            await sendFailed(
              job.id,
              message
            );
          } catch (reportError) {
            log(
              `Could not report compile failure: ${reportError.message}`
            );
          }
        }
      }
    } catch (error) {
      log(
        `Agent poll error: ${error.message}`
      );
    }

    await sleep(POLL_MS);
  }
}

run().catch((error) => {
  console.error(
    'MAV2 Compiler Agent fatal error:',
    error
  );
  process.exit(1);
});
