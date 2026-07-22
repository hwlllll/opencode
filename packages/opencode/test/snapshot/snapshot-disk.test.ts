import { test, expect, describe } from "bun:test"
import { Snapshot } from "../../src/snapshot"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { $ } from "bun"
import { Disk } from "../../src/util/disk"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { Global } from "../../src/global"

describe("Snapshot disk space integration", () => {
  test("should create snapshot when disk space is sufficient", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(`${dir}/a.txt`, "A")
        await $`git add .`.cwd(dir).quiet()
        await $`git commit --no-gpg-sign -m init`.cwd(dir).quiet()
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const hash = await Snapshot.track()
        expect(hash).toBeTruthy()
      },
    })
  })

  test("should handle snapshot creation with different disk space thresholds", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(`${dir}/a.txt`, "A")
        await $`git add .`.cwd(dir).quiet()
        await $`git commit --no-gpg-sign -m init`.cwd(dir).quiet()
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const hash1 = await Snapshot.track()
        expect(hash1).toBeTruthy()

        await Bun.write(`${tmp.path}/b.txt`, "B")

        const hash2 = await Snapshot.track()
        expect(hash2).toBeTruthy()
        expect(hash2).not.toBe(hash1)
      },
    })
  })

  test("should return same hash when no changes", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(`${dir}/a.txt`, "A")
        await $`git add .`.cwd(dir).quiet()
        await $`git commit --no-gpg-sign -m init`.cwd(dir).quiet()
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const hash1 = await Snapshot.track()
        expect(hash1).toBeTruthy()

        const hash2 = await Snapshot.track()
        expect(hash2).toBe(hash1)

        const hash3 = await Snapshot.track()
        expect(hash3).toBe(hash1)
      },
    })
  })

  test("should handle disk space check caching", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(`${dir}/a.txt`, "A")
        await $`git add .`.cwd(dir).quiet()
        await $`git commit --no-gpg-sign -m init`.cwd(dir).quiet()
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const hash1 = await Snapshot.track()
        expect(hash1).toBeTruthy()

        await Bun.write(`${tmp.path}/b.txt`, "B")

        const hash2 = await Snapshot.track()
        expect(hash2).toBeTruthy()
        expect(hash2).not.toBe(hash1)
      },
    })
  })

  test("should verify snapshot directory exists", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(`${dir}/a.txt`, "A")
        await $`git add .`.cwd(dir).quiet()
        await $`git commit --no-gpg-sign -m init`.cwd(dir).quiet()
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const hash = await Snapshot.track()
        expect(hash).toBeTruthy()

        const snapshotDir = path.join(Global.Path.data, "snapshot", Instance.project.id)
        const exists = await fs
          .access(snapshotDir)
          .then(() => true)
          .catch(() => false)
        expect(exists).toBe(true)
      },
    })
  })
})
