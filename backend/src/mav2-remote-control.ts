import type {
  Express,
  NextFunction,
  Request,
  RequestHandler,
  Response
} from 'express'
import { execFile } from 'node:child_process'
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { createHash, timingSafeEqual } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import type { PrismaClient } from './generated/prisma/client.js'

const execFileAsync = promisify(execFile)

type AuthenticatedRequest = Request & {
  user?: {
    userId: number
    email: string
    role: string
    companyId: number
  }
}

type RegisterOptions = {
  app: Express
  prisma: PrismaClient
  requireAuth: RequestHandler
  mav2TelemetryKey: string
}

const activeCompileJobs = new Map<number, Promise<void>>()

function isAdminRole(role: string | undefined) {
  return role === 'company_admin' || role === 'superadmin'
}

function requireMav2Admin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!isAdminRole(req.user?.role)) {
    return res.status(403).json({
      ok: false,
      message: 'Admin access required'
    })
  }

  next()
}

function mav2KeyIsValid(
  req: Request,
  configuredKey: string
) {
  if (!configuredKey) {
    return true
  }

  const requestKey =
    typeof req.headers['x-mavtrack-key'] === 'string'
      ? req.headers['x-mavtrack-key'].trim()
      : ''

  const expected =
    createHash('sha256')
      .update(configuredKey)
      .digest()

  const actual =
    createHash('sha256')
      .update(requestKey)
      .digest()

  return timingSafeEqual(expected, actual)
}

function safeVersion(value: unknown) {
  if (typeof value !== 'string') {
    return ''
  }

  const clean = value.trim()

  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(clean)
    ? clean
    : ''
}

function cleanSketchName(value: unknown) {
  const raw =
    typeof value === 'string'
      ? value.trim()
      : 'MAV2.ino'

  const base =
    path.basename(raw)
      .replace(/[^A-Za-z0-9._-]/g, '_')

  return base.toLowerCase().endsWith('.ino')
    ? base
    : `${base}.ino`
}

function missingOtaTemplateToken(
  source: string
) {
  const required = [
    '#define MAVTRACK_OTA_COMPATIBLE 1',
    '#include <Update.h>',
    'runtimeDeviceId',
    'cargarIdentidadPersistida',
    'procesarControlRemoto'
  ]

  return required.find(
    (token) =>
      !source.includes(token)
  ) || null
}

function compilerRoot() {
  return path.join(
    os.tmpdir(),
    'mavtrack-arduino'
  )
}

function compilerConfigPath() {
  return path.join(
    compilerRoot(),
    'arduino-cli.yaml'
  )
}

async function fileExists(filePath: string) {
  try {
    await access(
      filePath,
      fsConstants.F_OK
    )
    return true
  } catch {
    return false
  }
}

async function runCommand(
  command: string,
  args: string[],
  timeout = 10 * 60 * 1000
) {
  const result =
    await execFileAsync(
      command,
      args,
      {
        timeout,
        maxBuffer:
          20 * 1024 * 1024,
        env: {
          ...process.env,
          ARDUINO_UPDATER_ENABLE_NOTIFICATION:
            'false'
        }
      }
    )

  return [
    result.stdout || '',
    result.stderr || ''
  ]
    .filter(Boolean)
    .join('\n')
}

let compilerReadyPromise:
  Promise<string> | null = null

async function ensureArduinoCompiler() {
  if (compilerReadyPromise) {
    return compilerReadyPromise
  }

  compilerReadyPromise =
    (async () => {
      const root =
        compilerRoot()

      const binDir =
        path.join(root, 'bin')

      const dataDir =
        path.join(root, 'data')

      const downloadsDir =
        path.join(root, 'downloads')

      const userDir =
        path.join(root, 'user')

      await Promise.all([
        mkdir(binDir, {
          recursive: true
        }),
        mkdir(dataDir, {
          recursive: true
        }),
        mkdir(downloadsDir, {
          recursive: true
        }),
        mkdir(userDir, {
          recursive: true
        })
      ])

      let cliPath =
        process.env.MAV2_ARDUINO_CLI
          ?.trim() || ''

      if (!cliPath) {
        if (process.platform === 'win32') {
          const candidates = [
            'C:\\Program Files\\Arduino IDE\\resources\\app\\lib\\backend\\resources\\arduino-cli.exe',
            path.join(
              binDir,
              'arduino-cli.exe'
            )
          ]

          for (const candidate of candidates) {
            if (
              await fileExists(
                candidate
              )
            ) {
              cliPath = candidate
              break
            }
          }
        } else {
          cliPath =
            path.join(
              binDir,
              'arduino-cli'
            )
        }
      }

      if (
        !await fileExists(cliPath)
      ) {
        if (process.platform === 'win32') {
          throw new Error(
            'Arduino CLI is not installed on this server'
          )
        }

        const release =
          process.arch === 'arm64'
            ? {
                file:
                  'arduino-cli_1.6.0_Linux_ARM64.tar.gz',
                sha256:
                  '2ed4e1436bb3be1265966af8eba95dd25e28f3a9f92d0a58d371ed14dbaf550f'
              }
            : process.arch === 'x64'
              ? {
                  file:
                    'arduino-cli_1.6.0_Linux_64bit.tar.gz',
                  sha256:
                    '321ee249f44c78053234fec0f36101092bc6021bf24939e15e0cc2449c5ed250'
                }
              : null

        if (!release) {
          throw new Error(
            `Unsupported server architecture for Arduino CLI: ${process.arch}`
          )
        }

        const archivePath =
          path.join(
            root,
            release.file
          )

        const downloadUrl =
          `https://github.com/arduino/arduino-cli/releases/download/v1.6.0/${release.file}`

        const installScript =
          [
            'set -e',
            `mkdir -p "${binDir}"`,
            `curl -fL --retry 3 --connect-timeout 20 -o "${archivePath}" "${downloadUrl}"`,
            `echo "${release.sha256}  ${archivePath}" | sha256sum -c -`,
            `tar -xzf "${archivePath}" -C "${binDir}" arduino-cli`,
            `chmod +x "${cliPath}"`,
            `test -x "${cliPath}"`
          ].join('; ')

        await runCommand(
          'sh',
          [
            '-c',
            installScript
          ]
        )

        if (
          !await fileExists(
            cliPath
          )
        ) {
          throw new Error(
            'Arduino CLI installation completed without creating the executable'
          )
        }
      }

      const configPath =
        compilerConfigPath()

      await writeFile(
        configPath,
        [
          'board_manager:',
          '  additional_urls:',
          '    - https://espressif.github.io/arduino-esp32/package_esp32_index.json',
          'directories:',
          `  data: "${dataDir.replace(/\\/g, '/')}"`,
          `  downloads: "${downloadsDir.replace(/\\/g, '/')}"`,
          `  user: "${userDir.replace(/\\/g, '/')}"`,
          'updater:',
          '  enable_notification: false',
          ''
        ].join('\n'),
        'utf8'
      )

      const readyMarker =
        path.join(
          root,
          '.ready-esp32-4.0.0'
        )

      if (
        !await fileExists(
          readyMarker
        )
      ) {
        await runCommand(
          cliPath,
          [
            'core',
            'update-index',
            '--config-file',
            configPath
          ]
        )

        await runCommand(
          cliPath,
          [
            'core',
            'install',
            'esp32:esp32@4.0.0',
            '--config-file',
            configPath
          ],
          15 * 60 * 1000
        )

        await runCommand(
          cliPath,
          [
            'lib',
            'install',
            'OneWire',
            '--config-file',
            configPath
          ]
        )

        await runCommand(
          cliPath,
          [
            'lib',
            'install',
            'DallasTemperature',
            '--config-file',
            configPath
          ]
        )

        await writeFile(
          readyMarker,
          new Date().toISOString(),
          'utf8'
        )
      }

      return cliPath
    })()

  try {
    return await compilerReadyPromise
  } catch (error) {
    compilerReadyPromise = null
    throw error
  }
}

async function compileFirmware(
  prisma: PrismaClient,
  firmwareId: number
) {
  const existing =
    activeCompileJobs.get(
      firmwareId
    )

  if (existing) {
    return existing
  }

  const job =
    (async () => {
      const record =
        await prisma.mav2Firmware
          .findUnique({
            where: {
              id: firmwareId
            }
          })

      if (!record) {
        return
      }

      await prisma.mav2Firmware.update({
        where: {
          id: firmwareId
        },
        data: {
          compileStatus:
            'COMPILING',
          compileLog:
            'Preparing Arduino ESP32-S3 compiler...'
        }
      })

      let workDir = ''

      try {
        const source =
          record.sketchSource

        const missingTemplateToken =
          missingOtaTemplateToken(
            source
          )

        if (missingTemplateToken) {
          throw new Error(
            `Sketch rejected: missing OTA template token ${missingTemplateToken}`
          )
        }

        if (
          !/const\s+char\s*\*\s*FIRMWARE_VERSION\s*=\s*"[^"]*"\s*;/.test(
            source
          )
        ) {
          throw new Error(
            'Sketch rejected: missing FIRMWARE_VERSION declaration'
          )
        }

        const cliPath =
          await ensureArduinoCompiler()

        workDir =
          await mkdtemp(
            path.join(
              os.tmpdir(),
              'mav2-build-'
            )
          )

        const sketchFolderName =
          'MAV2_REMOTE'

        const sketchDir =
          path.join(
            workDir,
            sketchFolderName
          )

        const outputDir =
          path.join(
            workDir,
            'out'
          )

        await Promise.all([
          mkdir(
            sketchDir,
            {
              recursive: true
            }
          ),
          mkdir(
            outputDir,
            {
              recursive: true
            }
          )
        ])

        const compiledSource =
          source.replace(
            /const\s+char\s*\*\s*FIRMWARE_VERSION\s*=\s*"[^"]*"\s*;/,
            `const char* FIRMWARE_VERSION = "${record.version}";`
          )

        await writeFile(
          path.join(
            sketchDir,
            `${sketchFolderName}.ino`
          ),
          compiledSource,
          'utf8'
        )

        const compileOutput =
          await runCommand(
            cliPath,
            [
              'compile',
              '--fqbn',
              'esp32:esp32:esp32s3',
              '--output-dir',
              outputDir,
              '--config-file',
              compilerConfigPath(),
              sketchDir
            ],
            15 * 60 * 1000
          )

        const outputFiles =
          await readdir(
            outputDir
          )

        const appBinName =
          outputFiles.find(
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
          outputFiles.find(
            (name) =>
              name.endsWith('.bin') &&
              !name.includes(
                'bootloader'
              ) &&
              !name.includes(
                'partitions'
              )
          )

        if (!appBinName) {
          throw new Error(
            'Compilation completed but no application .bin was produced'
          )
        }

        const binary =
          await readFile(
            path.join(
              outputDir,
              appBinName
            )
          )

        const sha256 =
          createHash('sha256')
            .update(binary)
            .digest('hex')

        await prisma.mav2Firmware.update({
          where: {
            id: firmwareId
          },
          data: {
            binary:
              new Uint8Array(binary),
            binarySha256:
              sha256,
            binarySize:
              binary.length,
            compileStatus:
              'READY',
            compileLog:
              compileOutput.slice(
                -12000
              )
          }
        })
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error)

        await prisma.mav2Firmware.update({
          where: {
            id: firmwareId
          },
          data: {
            compileStatus:
              'FAILED',
            compileLog:
              message.slice(
                0,
                12000
              )
          }
        })
      } finally {
        if (workDir) {
          await rm(
            workDir,
            {
              recursive: true,
              force: true
            }
          ).catch(() => {})
        }
      }
    })()
      .finally(() => {
        activeCompileJobs.delete(
          firmwareId
        )
      })

  activeCompileJobs.set(
    firmwareId,
    job
  )

  return job
}

function commandPayload(
  command: {
    id: number
    type: string
    firmwareId: number | null
    payload: unknown
    firmware?: {
      id: number
      version: string
      binarySha256: string | null
      binarySize: number | null
    } | null
  }
) {
  if (
    command.type ===
      'FIRMWARE_UPDATE' &&
    command.firmware
  ) {
    return {
      id: command.id,
      type: command.type,
      firmware: {
        id:
          command.firmware.id,
        version:
          command.firmware.version,
        sha256:
          command.firmware.binarySha256,
        size:
          command.firmware.binarySize,
        path:
          `/api/mav2/firmware/${command.firmware.id}/bin`
      }
    }
  }

  return {
    id: command.id,
    type: command.type,
    payload:
      command.payload ?? null
  }
}

export async function deliverPendingMav2Command(
  prisma: PrismaClient,
  assetId: number
) {
  const command =
    await prisma.mav2Command
      .findFirst({
        where: {
          assetId,
          OR: [
            {
              status:
                'PENDING'
            },
            {
              type:
                'FIRMWARE_UPDATE',
              status:
                'INSTALLING'
            }
          ]
        },
        include: {
          firmware: {
            select: {
              id: true,
              version: true,
              binarySha256:
                true,
              binarySize:
                true
            }
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      })

  if (!command) {
    return null
  }

  await prisma.mav2Command.update({
    where: {
      id: command.id
    },
    data: {
      deliveredAt:
        command.deliveredAt ??
        new Date()
    }
  })

  return commandPayload(
    command
  )
}

export function registerMav2RemoteControl(
  options: RegisterOptions
) {
  const {
    app,
    prisma,
    requireAuth,
    mav2TelemetryKey
  } = options

  app.get(
    '/api/admin/mav2/control',
    requireAuth,
    requireMav2Admin,
    async (
      req: AuthenticatedRequest,
      res
    ) => {
      const companyId =
        req.user!.companyId

      const [
        assets,
        firmwares,
        commands
      ] =
        await Promise.all([
          prisma.asset.findMany({
            where: {
              companyId,
              active: true,
              trackingSource:
                'MAV2'
            },
            select: {
              id: true,
              deviceId: true,
              name: true,
              groupName: true,
              mav2FirmwareVersion:
                true,
              mav2LastCheckInAt:
                true
            },
            orderBy: {
              name: 'asc'
            }
          }),
          prisma.mav2Firmware.findMany({
            where: {
              companyId
            },
            select: {
              id: true,
              version: true,
              fileName: true,
              binarySha256: true,
              binarySize: true,
              compileStatus: true,
              compileLog: true,
              createdByEmail: true,
              createdAt: true,
              updatedAt: true
            },
            orderBy: {
              createdAt: 'desc'
            },
            take: 25
          }),
          prisma.mav2Command.findMany({
            where: {
              companyId
            },
            select: {
              id: true,
              type: true,
              status: true,
              resultMessage: true,
              createdAt: true,
              deliveredAt: true,
              completedAt: true,
              asset: {
                select: {
                  id: true,
                  deviceId: true,
                  name: true
                }
              },
              firmware: {
                select: {
                  id: true,
                  version: true
                }
              }
            },
            orderBy: {
              createdAt: 'desc'
            },
            take: 100
          })
        ])

      return res.json({
        ok: true,
        assets,
        firmwares,
        commands
      })
    }
  )

  app.post(
    '/api/admin/mav2/firmware',
    requireAuth,
    requireMav2Admin,
    async (
      req: AuthenticatedRequest,
      res
    ) => {
      const companyId =
        req.user!.companyId

      const version =
        safeVersion(
          req.body?.version
        )

      const sketchSource =
        typeof req.body
          ?.sketchSource ===
        'string'
          ? req.body
              .sketchSource
          : ''

      const fileName =
        cleanSketchName(
          req.body?.fileName
        )

      if (!version) {
        return res.status(400).json({
          ok: false,
          message:
            'Enter a valid firmware version'
        })
      }

      if (
        sketchSource.length <
          100 ||
        sketchSource.length >
          2 * 1024 * 1024
      ) {
        return res.status(400).json({
          ok: false,
          message:
            'Sketch must be between 100 bytes and 2 MB'
        })
      }

      const missingTemplateToken =
        missingOtaTemplateToken(
          sketchSource
        )

      if (missingTemplateToken) {
        return res.status(400).json({
          ok: false,
          message:
            `Sketch is missing OTA template token ${missingTemplateToken}`
        })
      }

      if (
        !/const\s+char\s*\*\s*FIRMWARE_VERSION\s*=\s*"[^"]*"\s*;/.test(
          sketchSource
        )
      ) {
        return res.status(400).json({
          ok: false,
          message:
            'Sketch is missing the FIRMWARE_VERSION declaration'
        })
      }

      try {
        const firmware =
          await prisma.mav2Firmware
            .create({
              data: {
                companyId,
                version,
                fileName,
                sketchSource,
                compileStatus:
                  'QUEUED',
                createdByEmail:
                  req.user!.email
              },
              select: {
                id: true,
                version: true,
                fileName: true,
                compileStatus: true,
                createdAt: true
              }
            })

        return res.status(202).json({
          ok: true,
          firmware
        })
      } catch (error: any) {
        if (
          error?.code ===
          'P2002'
        ) {
          return res
            .status(409)
            .json({
              ok: false,
              message:
                'That firmware version already exists'
            })
        }

        console.error(
          'MAV2 firmware upload error:',
          error
        )

        return res.status(500).json({
          ok: false,
          message:
            'Unable to create firmware build'
        })
      }
    }
  )

  app.post(
    '/api/admin/mav2/firmware/:id/compile',
    requireAuth,
    requireMav2Admin,
    async (
      req: AuthenticatedRequest,
      res
    ) => {
      const firmwareId =
        Number(
          req.params.id
        )

      const firmware =
        await prisma.mav2Firmware
          .findFirst({
            where: {
              id: firmwareId,
              companyId:
                req.user!.companyId
            },
            select: {
              id: true
            }
          })

      if (!firmware) {
        return res
          .status(404)
          .json({
            ok: false,
            message:
              'Firmware not found'
          })
      }

      await prisma.mav2Firmware.update({
        where: {
          id: firmware.id
        },
        data: {
          compileStatus:
            'QUEUED',
          compileLog: null,
          binary: null,
          binarySha256: null,
          binarySize: null
        }
      })

      return res
        .status(202)
        .json({
          ok: true,
          firmwareId:
            firmware.id
        })
    }
  )

  app.get(
    '/api/mav2/compiler/jobs/next',
    requireAuth,
    requireMav2Admin,
    async (
      req: AuthenticatedRequest,
      res
    ) => {
      const companyId =
        req.user!.companyId

      const staleBefore =
        new Date(
          Date.now() -
          15 * 60 * 1000
        )

      await prisma.mav2Firmware
        .updateMany({
          where: {
            companyId,
            compileStatus:
              'COMPILING',
            binary: null,
            updatedAt: {
              lt: staleBefore
            }
          },
          data: {
            compileStatus:
              'QUEUED',
            compileLog:
              'Requeued after stale compiler claim'
          }
        })

      const firmware =
        await prisma.mav2Firmware
          .findFirst({
            where: {
              companyId,
              compileStatus:
                'QUEUED'
            },
            orderBy: {
              createdAt: 'asc'
            },
            select: {
              id: true,
              version: true,
              fileName: true,
              sketchSource: true
            }
          })

      if (!firmware) {
        return res.json({
          ok: true,
          job: null
        })
      }

      const claimed =
        await prisma.mav2Firmware
          .updateMany({
            where: {
              id: firmware.id,
              companyId,
              compileStatus:
                'QUEUED'
            },
            data: {
              compileStatus:
                'COMPILING',
              compileLog:
                'Claimed by MAV2 Compiler Agent'
            }
          })

      if (claimed.count !== 1) {
        return res.json({
          ok: true,
          job: null
        })
      }

      return res.json({
        ok: true,
        job: {
          id: firmware.id,
          version:
            firmware.version,
          fileName:
            firmware.fileName,
          sketchSource:
            firmware.sketchSource,
          fqbn:
            'esp32:esp32:esp32s3'
        }
      })
    }
  )

  app.post(
    '/api/mav2/compiler/jobs/:id/result',
    requireAuth,
    requireMav2Admin,
    async (
      req: AuthenticatedRequest,
      res
    ) => {
      const companyId =
        req.user!.companyId

      const firmwareId =
        Number(req.params.id)

      if (
        !Number.isInteger(
          firmwareId
        )
      ) {
        return res
          .status(400)
          .json({
            ok: false,
            message:
              'Invalid firmware build id'
          })
      }

      const status =
        String(
          req.body?.status ||
          ''
        ).toUpperCase()

      const compileLog =
        typeof req.body
          ?.compileLog ===
        'string'
          ? req.body.compileLog
              .slice(-12000)
          : null

      if (status === 'FAILED') {
        await prisma.mav2Firmware
          .updateMany({
            where: {
              id: firmwareId,
              companyId,
              compileStatus: {
                in: [
                  'QUEUED',
                  'COMPILING'
                ]
              }
            },
            data: {
              compileStatus:
                'FAILED',
              compileLog:
                compileLog ||
                'Compiler agent reported a failure',
              binary: null,
              binarySha256: null,
              binarySize: null
            }
          })

        return res.json({
          ok: true
        })
      }

      if (status !== 'READY') {
        return res
          .status(400)
          .json({
            ok: false,
            message:
              'Compiler result status must be READY or FAILED'
          })
      }

      const binaryBase64 =
        typeof req.body
          ?.binaryBase64 ===
        'string'
          ? req.body.binaryBase64
          : ''

      let binary:
        Buffer

      try {
        binary =
          Buffer.from(
            binaryBase64,
            'base64'
          )
      } catch {
        return res
          .status(400)
          .json({
            ok: false,
            message:
              'Invalid firmware binary'
          })
      }

      if (
        binary.length <
          10000 ||
        binary.length >
          4 * 1024 * 1024
      ) {
        return res
          .status(400)
          .json({
            ok: false,
            message:
              'Firmware binary size is invalid'
          })
      }

      if (
        binary[0] !== 0xE9
      ) {
        return res
          .status(400)
          .json({
            ok: false,
            message:
              'Firmware binary does not look like an ESP32 application image'
          })
      }

      const computedSha256 =
        createHash('sha256')
          .update(binary)
          .digest('hex')

      const suppliedSha256 =
        typeof req.body
          ?.sha256 ===
        'string'
          ? req.body.sha256
              .trim()
              .toLowerCase()
          : ''

      if (
        suppliedSha256 &&
        suppliedSha256 !==
          computedSha256
      ) {
        return res
          .status(400)
          .json({
            ok: false,
            message:
              'Firmware SHA-256 mismatch'
          })
      }

      const updated =
        await prisma.mav2Firmware
          .updateMany({
            where: {
              id: firmwareId,
              companyId,
              compileStatus: {
                in: [
                  'QUEUED',
                  'COMPILING'
                ]
              }
            },
            data: {
              compileStatus:
                'READY',
              compileLog:
                compileLog ||
                'Compiled successfully by MAV2 Compiler Agent',
              binary:
                new Uint8Array(
                  binary
                ),
              binarySha256:
                computedSha256,
              binarySize:
                binary.length
            }
          })

      if (updated.count !== 1) {
        return res
          .status(409)
          .json({
            ok: false,
            message:
              'Firmware build is no longer waiting for a compiler result'
          })
      }

      return res.json({
        ok: true,
        firmwareId,
        binarySize:
          binary.length,
        sha256:
          computedSha256
      })
    }
  )

  app.post(
    '/api/admin/mav2/refresh',
    requireAuth,
    requireMav2Admin,
    async (
      req: AuthenticatedRequest,
      res
    ) => {
      const companyId =
        req.user!.companyId

      const requestedIds =
        Array.isArray(
          req.body?.assetIds
        )
          ? req.body.assetIds
              .map(Number)
              .filter(
                Number.isInteger
              )
          : []

      const all =
        req.body?.all === true

      if (
        !all &&
        requestedIds.length === 0
      ) {
        return res
          .status(400)
          .json({
            ok: false,
            message:
              'Select at least one MAV2 asset'
          })
      }

      const assets =
        await prisma.asset
          .findMany({
            where: {
              companyId,
              active: true,
              trackingSource:
                'MAV2',
              mav2FirmwareVersion: {
                not: null
              },
              ...(all
                ? {}
                : {
                    id: {
                      in:
                        requestedIds
                    }
                  })
            },
            select: {
              id: true
            }
          })

      let created = 0

      for (const asset of assets) {
        const pending =
          await prisma.mav2Command
            .findFirst({
              where: {
                assetId:
                  asset.id,
                type:
                  'REFRESH_NOW',
                status:
                  'PENDING'
              },
              select: {
                id: true
              }
            })

        if (!pending) {
          await prisma.mav2Command
            .create({
              data: {
                companyId,
                assetId:
                  asset.id,
                type:
                  'REFRESH_NOW',
                status:
                  'PENDING',
                requestedByEmail:
                  req.user!.email
              }
            })

          created++
        }
      }

      return res.json({
        ok: true,
        targeted:
          assets.length,
        queued:
          created
      })
    }
  )

  app.post(
    '/api/admin/mav2/firmware/:id/deploy',
    requireAuth,
    requireMav2Admin,
    async (
      req: AuthenticatedRequest,
      res
    ) => {
      const companyId =
        req.user!.companyId

      const firmwareId =
        Number(
          req.params.id
        )

      const assetIds =
        Array.isArray(
          req.body?.assetIds
        )
          ? req.body.assetIds
              .map(Number)
              .filter(
                Number.isInteger
              )
          : []

      if (
        !Number.isInteger(
          firmwareId
        ) ||
        assetIds.length === 0
      ) {
        return res
          .status(400)
          .json({
            ok: false,
            message:
              'Firmware and at least one device are required'
          })
      }

      const firmware =
        await prisma.mav2Firmware
          .findFirst({
            where: {
              id: firmwareId,
              companyId
            }
          })

      if (
        !firmware ||
        firmware.compileStatus !==
          'READY' ||
        !firmware.binary ||
        !firmware.binarySha256
      ) {
        return res
          .status(409)
          .json({
            ok: false,
            message:
              'Firmware is not ready for deployment'
          })
      }

      const assets =
        await prisma.asset
          .findMany({
            where: {
              companyId,
              active: true,
              trackingSource:
                'MAV2',
              id: {
                in:
                  assetIds
              },
              mav2FirmwareVersion: {
                not: null
              }
            },
            select: {
              id: true
            }
          })

      for (const asset of assets) {
        await prisma.mav2Command.updateMany({
          where: {
            assetId:
              asset.id,
            type:
              'FIRMWARE_UPDATE',
            status:
              'PENDING'
          },
          data: {
            status:
              'SUPERSEDED',
            completedAt:
              new Date(),
            resultMessage:
              'Replaced by a newer firmware assignment'
          }
        })

        await prisma.mav2Command.create({
          data: {
            companyId,
            assetId:
              asset.id,
            firmwareId:
              firmware.id,
            type:
              'FIRMWARE_UPDATE',
            status:
              'PENDING',
            requestedByEmail:
              req.user!.email,
            payload: {
              version:
                firmware.version,
              sha256:
                firmware.binarySha256,
              size:
                firmware.binarySize
            } as any
          }
        })
      }

      return res.json({
        ok: true,
        targeted:
          assets.length
      })
    }
  )

  app.post(
    '/api/mav2/checkin',
    async (req, res) => {
      if (
        !mav2KeyIsValid(
          req,
          mav2TelemetryKey
        )
      ) {
        return res
          .status(401)
          .json({
            ok: false,
            message:
              'Invalid MAV2 credentials'
          })
      }

      const deviceId =
        typeof req.body
          ?.deviceId ===
        'string'
          ? req.body.deviceId
              .trim()
          : ''

      const firmwareVersion =
        typeof req.body
          ?.firmwareVersion ===
        'string'
          ? req.body
              .firmwareVersion
              .trim()
              .slice(0, 64)
          : ''

      if (!deviceId) {
        return res
          .status(400)
          .json({
            ok: false,
            message:
              'deviceId is required'
          })
      }

      const asset =
        await prisma.asset
          .findUnique({
            where: {
              deviceId
            }
          })

      if (
        !asset ||
        !asset.active ||
        asset.trackingSource !==
          'MAV2'
      ) {
        return res
          .status(404)
          .json({
            ok: false,
            message:
              'MAV2 asset not found'
          })
      }

      await prisma.asset.update({
        where: {
          id: asset.id
        },
        data: {
          mav2LastCheckInAt:
            new Date(),
          ...(firmwareVersion
            ? {
                mav2FirmwareVersion:
                  firmwareVersion
              }
            : {})
        }
      })

      if (firmwareVersion) {
        const firmwareCommands =
          await prisma.mav2Command
            .findMany({
              where: {
                assetId:
                  asset.id,
                type:
                  'FIRMWARE_UPDATE',
                status: {
                  in: [
                    'PENDING',
                    'INSTALLING'
                  ]
                },
                firmware: {
                  version:
                    firmwareVersion
                }
              },
              select: {
                id: true
              }
            })

        if (
          firmwareCommands.length >
          0
        ) {
          await prisma.mav2Command
            .updateMany({
              where: {
                id: {
                  in:
                    firmwareCommands
                      .map(
                        (item) =>
                          item.id
                      )
                }
              },
              data: {
                status:
                  'COMPLETED',
                completedAt:
                  new Date(),
                resultMessage:
                  `Device booted firmware ${firmwareVersion}`
              }
            })
        }
      }

      const command =
        await deliverPendingMav2Command(
          prisma,
          asset.id
        )

      return res.json({
        ok: true,
        command,
        controlPollSec: 300
      })
    }
  )

  app.post(
    '/api/mav2/command-ack',
    async (req, res) => {
      if (
        !mav2KeyIsValid(
          req,
          mav2TelemetryKey
        )
      ) {
        return res
          .status(401)
          .json({
            ok: false,
            message:
              'Invalid MAV2 credentials'
          })
      }

      const deviceId =
        typeof req.body
          ?.deviceId ===
        'string'
          ? req.body.deviceId
              .trim()
          : ''

      const commandId =
        Number(
          req.body?.commandId
        )

      const requestedStatus =
        String(
          req.body?.status ||
          'COMPLETED'
        ).toUpperCase()

      const status =
        [
          'COMPLETED',
          'FAILED',
          'INSTALLING'
        ].includes(
          requestedStatus
        )
          ? requestedStatus
          : 'COMPLETED'

      const message =
        typeof req.body
          ?.message ===
        'string'
          ? req.body.message
              .trim()
              .slice(
                0,
                500
              )
          : null

      const firmwareVersion =
        typeof req.body
          ?.firmwareVersion ===
        'string'
          ? req.body
              .firmwareVersion
              .trim()
              .slice(0, 64)
          : ''

      const asset =
        await prisma.asset
          .findUnique({
            where: {
              deviceId
            },
            select: {
              id: true
            }
          })

      if (
        !asset ||
        !Number.isInteger(
          commandId
        )
      ) {
        return res
          .status(400)
          .json({
            ok: false,
            message:
              'Invalid command acknowledgement'
          })
      }

      const command =
        await prisma.mav2Command
          .findFirst({
            where: {
              id: commandId,
              assetId:
                asset.id
            },
            select: {
              id: true
            }
          })

      if (!command) {
        return res
          .status(404)
          .json({
            ok: false,
            message:
              'Command not found'
          })
      }

      await prisma.mav2Command.update({
        where: {
          id: command.id
        },
        data: {
          status,
          resultMessage:
            message,
          ...(status ===
          'INSTALLING'
            ? {}
            : {
                completedAt:
                  new Date()
              })
        }
      })

      if (firmwareVersion) {
        await prisma.asset.update({
          where: {
            id: asset.id
          },
          data: {
            mav2FirmwareVersion:
              firmwareVersion,
            mav2LastCheckInAt:
              new Date()
          }
        })
      }

      return res.json({
        ok: true
      })
    }
  )

  app.get(
    '/api/mav2/firmware/:id/bin',
    async (req, res) => {
      if (
        !mav2KeyIsValid(
          req,
          mav2TelemetryKey
        )
      ) {
        return res
          .status(401)
          .end()
      }

      const firmwareId =
        Number(
          req.params.id
        )

      const deviceId =
        typeof req.query
          .deviceId ===
        'string'
          ? req.query.deviceId
              .trim()
          : ''

      if (
        !Number.isInteger(
          firmwareId
        ) ||
        !deviceId
      ) {
        return res
          .status(400)
          .end()
      }

      const asset =
        await prisma.asset
          .findUnique({
            where: {
              deviceId
            },
            select: {
              id: true
            }
          })

      if (!asset) {
        return res
          .status(404)
          .end()
      }

      const command =
        await prisma.mav2Command
          .findFirst({
            where: {
              assetId:
                asset.id,
              firmwareId,
              type:
                'FIRMWARE_UPDATE',
              status: {
                in: [
                  'PENDING',
                  'INSTALLING'
                ]
              }
            },
            include: {
              firmware: true
            },
            orderBy: {
              createdAt: 'desc'
            }
          })

      if (
        !command?.firmware
          ?.binary
      ) {
        return res
          .status(404)
          .end()
      }

      const binary =
        Buffer.from(
          command.firmware
            .binary
        )

      res.setHeader(
        'Content-Type',
        'application/octet-stream'
      )
      res.setHeader(
        'Content-Length',
        String(
          binary.length
        )
      )
      res.setHeader(
        'X-MAVTRACK-SHA256',
        command.firmware
          .binarySha256 || ''
      )
      res.setHeader(
        'Cache-Control',
        'no-store'
      )

      return res.send(
        binary
      )
    }
  )

  if (
    process.env
      .MAV2_COMPILER_WARMUP ===
    'true'
  ) {
    void ensureArduinoCompiler()
      .catch((error) => {
        console.warn(
          'MAV2 compiler warmup failed:',
          error instanceof Error
            ? error.message
            : error
        )
      })
  }
}
