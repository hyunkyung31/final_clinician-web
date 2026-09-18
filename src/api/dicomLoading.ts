export function withDicomTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    operation.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}
