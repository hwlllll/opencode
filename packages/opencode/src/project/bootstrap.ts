import { Plugin } from "../plugin"
import { Format } from "../format"
import { LSP } from "../lsp"
import { File } from "../file"
import { FileWatcher } from "../file/watcher"
import { Snapshot } from "../snapshot"
import { Project } from "./project"
import { Vcs } from "./vcs"
import { Bus } from "../bus"
import { Command } from "../command"
import { Instance } from "./instance"
import { Log } from "@/util/log"
import { ShareNext } from "@/share/share-next"
import { registerDynamicConfigReload } from "./dynamic-config-reload"

export async function InstanceBootstrap() {
  Log.Default.info("bootstrapping", { directory: Instance.directory })
  const t0 = Date.now()
  let t1: number
  t1 = Date.now(); await Plugin.init(); Log.Default.debug("[perf.bootstrap] Plugin.init", { durationMs: Date.now() - t1 })
  t1 = Date.now(); ShareNext.init(); Log.Default.debug("[perf.bootstrap] ShareNext.init", { durationMs: Date.now() - t1 })
  t1 = Date.now(); Format.init(); Log.Default.debug("[perf.bootstrap] Format.init", { durationMs: Date.now() - t1 })
  t1 = Date.now(); await LSP.init(); Log.Default.debug("[perf.bootstrap] LSP.init", { durationMs: Date.now() - t1 })
  t1 = Date.now(); File.init(); Log.Default.debug("[perf.bootstrap] File.init", { durationMs: Date.now() - t1 })
  t1 = Date.now(); FileWatcher.init(); Log.Default.debug("[perf.bootstrap] FileWatcher.init", { durationMs: Date.now() - t1 })
  t1 = Date.now(); Vcs.init(); Log.Default.debug("[perf.bootstrap] Vcs.init", { durationMs: Date.now() - t1 })
  t1 = Date.now(); Snapshot.init(); Log.Default.debug("[perf.bootstrap] Snapshot.init", { durationMs: Date.now() - t1 })
  t1 = Date.now(); registerDynamicConfigReload(); Log.Default.debug("[perf.bootstrap] registerDynamicConfigReload", { durationMs: Date.now() - t1 })
  Log.Default.debug("[perf.bootstrap] TOTAL", { durationMs: Date.now() - t0 })

  Bus.subscribe(Command.Event.Executed, async (payload) => {
    if (payload.properties.name === Command.Default.INIT) {
      Project.setInitialized(Instance.project.id)
    }
  })
}
