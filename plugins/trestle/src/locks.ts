import { Database } from 'bun:sqlite'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

export class Mutex {
  private tail = Promise.resolve()

  run<T>(action: () => Promise<T>): Promise<T> {
    const result = this.tail.then(action)
    this.tail = result.then(() => {}, () => {})
    return result
  }

  drain(): Promise<void> {
    return this.tail
  }
}

const fileLocks = new Map<string, { mutex: Mutex; pending: number }>()

export async function withFileLock<T>(file: string, action: () => Promise<T>): Promise<T> {
  const key = resolve(file)
  const entry = fileLocks.get(key) ?? { mutex: new Mutex(), pending: 0 }
  fileLocks.set(key, entry)
  entry.pending++
  try {
    return await entry.mutex.run(() => withSqliteLock(key, action))
  } finally {
    if (--entry.pending === 0) fileLocks.delete(key)
  }
}

async function withSqliteLock<T>(file: string, action: () => Promise<T>): Promise<T> {
  await mkdir(dirname(file), { recursive: true })
  const db = new Database(file, { create: true })
  try {
    db.exec('PRAGMA busy_timeout = 0')
    while (true) {
      try {
        db.exec('BEGIN IMMEDIATE')
        break
      } catch (error) {
        if ((error as { code?: string }).code !== 'SQLITE_BUSY') throw error
        await delay(20)
      }
    }
    return await action()
  } finally {
    db.close()
  }
}
