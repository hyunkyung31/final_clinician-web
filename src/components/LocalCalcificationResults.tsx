import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  Box,
  FolderOpen,
  RotateCcw,
  X,
} from 'lucide-react'
import './local-calcification.css'

const ModelViewer = lazy(() =>
  import('./MedicalModelViewer').then((module) => ({
    default: module.MedicalModelViewer,
  })),
)

type Role = 'mesh' | 'overlay' | 'preview'

type ResultFiles = Partial<Record<Role, File>>
type ResultUrls = Partial<Record<Role, string>>

const labels: Record<Role, string> = {
  mesh: '석회화 STL',
  overlay: 'CT + prediction overlay',
  preview: '3D preview',
}

/**
 * 서버에서 전달받을 3D 석회화 분석 결과 타입
 *
 * API 연결 후 아래 값들을 그대로 넘겨주면 된다.
 */
export type CalcificationServerResult = {
  meshUrl?: string
  overlayUrl?: string
  previewUrl?: string

  rawVoxels?: number
  hu130Voxels?: number

  modelName?: string
  modelVersion?: string
}

type LocalCalcificationResultsProps = {
  result?: CalcificationServerResult | null
}

export function LocalCalcificationResults({
  result,
}: LocalCalcificationResultsProps) {
  // ---------------------------------------------------------
  // 로컬 파일 선택용
  // ---------------------------------------------------------

  const [files, setFiles] =
    useState<ResultFiles>({})

  const [urls, setUrls] =
    useState<ResultUrls>({})

  // ---------------------------------------------------------
  // 상태
  // ---------------------------------------------------------

  const [error, setError] =
    useState('')

  const [modelError, setModelError] =
    useState('')

  const [status, setStatus] =
    useState('')

  const [revision, setRevision] =
    useState(0)

  // ---------------------------------------------------------
  // file input refs
  // ---------------------------------------------------------

  const inputs =
    useRef<
      Partial<Record<Role, HTMLInputElement | null>>
    >({})

  // ---------------------------------------------------------
  // Viewer callbacks
  // ---------------------------------------------------------

  const onStatus = useCallback(
    (message: string) => {
      setStatus(message)
    },
    [],
  )

  const onError = useCallback(
    (message: string) => {
      setModelError(message)
    },
    [],
  )

  // ---------------------------------------------------------
  // 로컬 File -> Object URL 변환
  // ---------------------------------------------------------

  useEffect(() => {
    const next: ResultUrls = {}

    for (
      const role of [
        'mesh',
        'overlay',
        'preview',
      ] as const
    ) {
      if (files[role]) {
        next[role] =
          URL.createObjectURL(files[role])
      }
    }

    setUrls(next)

    setModelError('')
    setStatus('')

    return () => {
      Object.values(next).forEach(
        (url) => {
          URL.revokeObjectURL(url)
        },
      )
    }
  }, [files])

  // ---------------------------------------------------------
  // 서버 결과 존재 여부
  // ---------------------------------------------------------

  const isServerResult = Boolean(
    result?.meshUrl ||
      result?.overlayUrl ||
      result?.previewUrl,
  )

  // ---------------------------------------------------------
  // 실제 화면에 표시할 URL
  //
  // 서버 결과가 있으면 서버 URL 우선
  // 없으면 로컬 파일 URL 사용
  // ---------------------------------------------------------

  const displayUrls: ResultUrls = {
    mesh:
      result?.meshUrl ??
      urls.mesh,

    overlay:
      result?.overlayUrl ??
      urls.overlay,

    preview:
      result?.previewUrl ??
      urls.preview,
  }

  // ---------------------------------------------------------
  // 파일 선택
  // ---------------------------------------------------------

  function select(
    role: Role,
    file?: File,
  ) {
    if (!file) return

    const extension =
      role === 'mesh'
        ? '.stl'
        : '.png'

    if (
      !file.name
        .toLowerCase()
        .endsWith(extension) ||
      !file.size
    ) {
      setError(
        `${labels[role]}에는 내용이 있는 ${extension} 파일을 선택해주세요.`,
      )

      return
    }

    setError('')

    setFiles((current) => ({
      ...current,
      [role]: file,
    }))
  }

  // ---------------------------------------------------------
  // 로컬 선택 초기화
  // ---------------------------------------------------------

  function clear() {
    setFiles({})
    setError('')
    setModelError('')
    setStatus('')

    Object.values(
      inputs.current,
    ).forEach((input) => {
      if (input) {
        input.value = ''
      }
    })
  }

  // ---------------------------------------------------------
  // Viewer 초기화
  //
  // key 변경으로 MedicalModelViewer를 다시 mount
  // ---------------------------------------------------------

  function resetViewer() {
    setModelError('')

    setRevision(
      (value) =>
        value + 1,
    )
  }

  return (
    <section
      className="feature-card local-calcification-results"
      aria-label="COCA U-Net 석회화 결과 확인"
    >
      {/* -------------------------------------------------- */}
      {/* Header */}
      {/* -------------------------------------------------- */}

      <header>
        <div>
          <h2>
            <Box size={18} />
            COCA U-Net · 석회화 결과
          </h2>

          <p>
            angio-unet:
            {result?.modelVersion ??
              '1.0.3'}
          </p>
        </div>

        {!isServerResult &&
          Object.keys(files).length >
            0 && (
            <button
              type="button"
              onClick={clear}
            >
              <X size={15} />
              선택 해제
            </button>
          )}
      </header>

      {/* -------------------------------------------------- */}
      {/* 안내 문구 */}
      {/* -------------------------------------------------- */}

      <p className="local-result-notice">
        {isServerResult
          ? 'AI 분석이 완료되었습니다. 생성된 석회화 3D 모델과 CT overlay 결과를 확인할 수 있습니다.'
          : 'Docker가 생성한 동일 검사 결과의 STL·PNG를 선택하세요. 파일은 이 브라우저에서만 열리며 서버에 저장되거나 현재 환자에 연결되지 않습니다.'}
      </p>

      {/* -------------------------------------------------- */}
      {/* 서버 분석 결과 요약 */}
      {/* -------------------------------------------------- */}

      {isServerResult && (
        <div className="local-result-summary">
          <div>
            <span>모델</span>

            <strong>
              {result?.modelName ??
                'Transfer U-Net'}
            </strong>
          </div>

          <div>
            <span>버전</span>

            <strong>
              {result?.modelVersion ??
                '1.0.3'}
            </strong>
          </div>

          <div>
            <span>
              Raw voxels
            </span>

            <strong>
              {result?.rawVoxels !==
              undefined
                ? result.rawVoxels.toLocaleString()
                : '-'}
            </strong>
          </div>

          <div>
            <span>
              HU130 voxels
            </span>

            <strong>
              {result?.hu130Voxels !==
              undefined
                ? result.hu130Voxels.toLocaleString()
                : '-'}
            </strong>
          </div>
        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* 로컬 파일 선택 */}
      {/* -------------------------------------------------- */}

      {!isServerResult && (
        <div className="local-result-file-row">
          {(
            [
              'mesh',
              'overlay',
              'preview',
            ] as const
          ).map((role) => (
            <label key={role}>
              <span>
                <FolderOpen
                  size={15}
                />

                {labels[role]}
                {' 선택'}
              </span>

              <input
                ref={(input) => {
                  inputs.current[
                    role
                  ] = input
                }}
                aria-label={`${labels[role]} 파일`}
                type="file"
                accept={
                  role === 'mesh'
                    ? '.stl'
                    : '.png'
                }
                onChange={(
                  event,
                ) =>
                  select(
                    role,
                    event.target
                      .files?.[0],
                  )
                }
              />

              <small>
                {files[role]
                  ?.name ??
                  (role === 'mesh'
                    ? 'calcification.stl'
                    : role ===
                        'overlay'
                      ? 'calcification_overlay.png'
                      : 'calcification_3d.png')}
              </small>
            </label>
          ))}
        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* 파일 선택 오류 */}
      {/* -------------------------------------------------- */}

      {error && (
        <p
          className="api-inline-error"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* -------------------------------------------------- */}
      {/* STL Viewer */}
      {/* -------------------------------------------------- */}

      {displayUrls.mesh && (
        <section className="local-result-model">
          <header>
            <strong>
              석회화 3D 모델
            </strong>

            <button
              type="button"
              onClick={
                resetViewer
              }
            >
              <RotateCcw
                size={14}
              />
              시점 초기화
            </button>
          </header>

          <div className="local-result-model-stage">
            <Suspense
              fallback={
                <p>
                  3D Viewer 준비
                  중…
                </p>
              }
            >
              <ModelViewer
                key={revision}
                sourceUrl={
                  displayUrls.mesh
                }
                format="STL"
                color="#e6be28"
                onStatus={
                  onStatus
                }
                onError={
                  onError
                }
              />
            </Suspense>

            {modelError && (
              <div
                className="local-result-model-error"
                role="alert"
              >
                <strong>
                  STL을 표시하지
                  못했습니다
                </strong>

                <span>
                  {modelError}
                </span>

                <span>
                  아래 3D preview
                  PNG로 결과를 확인할
                  수 있습니다.
                </span>
              </div>
            )}
          </div>

          <footer
            aria-live="polite"
          >
            {modelError
              ? '파일 또는 브라우저의 3D 지원을 확인해주세요.'
              : status}
          </footer>
        </section>
      )}

      {/* -------------------------------------------------- */}
      {/* PNG 결과 */}
      {/* -------------------------------------------------- */}

      {(displayUrls.overlay ||
        displayUrls.preview) && (
        <div className="local-result-previews">
          {(
            [
              'overlay',
              'preview',
            ] as const
          ).map((role) => {
            const url =
              displayUrls[role]

            if (!url) {
              return null
            }

            const filename =
              files[role]
                ?.name ??
              (role === 'overlay'
                ? 'calcification_overlay.png'
                : 'calcification_3d.png')

            return (
              <LocalResultImage
                key={url}
                url={url}
                label={
                  labels[role]
                }
                filename={
                  filename
                }
              />
            )
          })}
        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* 빈 상태 */}
      {/* -------------------------------------------------- */}

      {!isServerResult &&
        !Object.keys(files)
          .length && (
          <p className="local-result-empty">
            STL을 선택하면
            회전·확대할 수 있는
            3D 모델이 표시됩니다.
            PNG만 선택해
            미리보기를 확인할
            수도 있습니다.
          </p>
        )}
    </section>
  )
}


function LocalResultImage({
  url,
  label,
  filename,
}: {
  url: string
  label: string
  filename: string
}) {
  const [failed, setFailed] =
    useState(false)

  // URL이 바뀌면 이전 실패 상태 초기화
  useEffect(() => {
    setFailed(false)
  }, [url])

  return (
    <figure>
      <figcaption>
        <strong>
          {label}
        </strong>

        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          크게 보기
        </a>
      </figcaption>

      {failed ? (
        <p role="alert">
          PNG 이미지를 읽지
          못했습니다. 파일을
          확인해주세요.
        </p>
      ) : (
        <img
          src={url}
          alt={label}
          onError={() =>
            setFailed(true)
          }
        />
      )}

      <small>
        {filename}
      </small>
    </figure>
  )
}