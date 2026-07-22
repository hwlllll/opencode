import { CommandLocale } from "./locales"

export namespace CostrictCommand {
  export function get(name: string, lang = "zh-CN"): string {
    return CommandLocale.get(name, lang)
  }
}
