import { cmd } from "./cmd"
import { runRawDumpWorker } from "@/plugin/raw-dump/worker"

export const RawDumpCommand = cmd({
  command: "raw-dump [command]",
  describe: false,
  builder: (yargs) =>
    yargs.command("_worker", false, {}, async () => {
      await runRawDumpWorker()
    }),
  handler: async () => {
    process.exit(1)
  },
})
