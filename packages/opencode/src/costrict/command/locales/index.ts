import ZH_CN_PROJECT_WIKI from "./zh-CN/project-wiki.txt"
import ZH_CN_ENHANCED_INIT from "./zh-CN/enhanced-initialize.txt"
import ZH_CN_REVIEW from "./zh-CN/review.txt"
import ZH_CN_SECURITY_REVIEW from "./zh-CN/security-review.txt"
import ZH_CN_SKILL_CAPTURE from "./zh-CN/skills-capture.txt"
import EN_PROJECT_WIKI from "./en/project-wiki.txt"
import EN_ENHANCED_INIT from "./en/enhanced-initialize.txt"
import EN_REVIEW from "./en/review.txt"
import EN_SECURITY_REVIEW from "./en/security-review.txt"
import EN_SKILL_CAPTURE from "./en/skills-capture.txt"

const COMMANDS: Record<string, Record<string, string>> = {
  "project-wiki": { "zh-CN": ZH_CN_PROJECT_WIKI, en: EN_PROJECT_WIKI },
  "enhanced-initialize": { "zh-CN": ZH_CN_ENHANCED_INIT, en: EN_ENHANCED_INIT },
  "review": { "zh-CN": ZH_CN_REVIEW, en: EN_REVIEW },
  "security-review": { "zh-CN": ZH_CN_SECURITY_REVIEW, en: EN_SECURITY_REVIEW },
  "skills-capture": { "zh-CN": ZH_CN_SKILL_CAPTURE, en: EN_SKILL_CAPTURE },
}

export namespace CommandLocale {
  export function get(name: string, lang: string): string {
    return COMMANDS[name]?.[lang] ?? COMMANDS[name]?.en ?? ""
  }
}
