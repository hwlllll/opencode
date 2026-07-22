import z from "zod"
import { Bus } from "@/bus"
import { Tool } from "./tool"
import { Question } from "../question"
import { QuestionID } from "../question/schema"
import DESCRIPTION from "./question.txt"

export const QuestionTool = Tool.define("question", {
  description: DESCRIPTION,
  parameters: z.object({
    questions: z.array(Question.Info.omit({ custom: true })).describe("Questions to ask"),
  }),
  async execute(params, ctx) {
    const timeout = 600000
    const defaultAnswers = params.questions.map((q) =>
      q.options.length > 0 ? [q.options[0].label] : []
    )

    let requestID: QuestionID | undefined
    const unsub = Bus.subscribe(Question.Event.Asked, (evt) => {
      if (
        evt.properties.sessionID === ctx.sessionID &&
        evt.properties.tool?.messageID === ctx.messageID &&
        evt.properties.tool?.callID === ctx.callID
      ) {
        requestID = evt.properties.id
      }
    })

    const answers = await Promise.race([
      Question.ask({
        sessionID: ctx.sessionID,
        questions: params.questions,
        tool: ctx.callID ? { messageID: ctx.messageID, callID: ctx.callID } : undefined,
      }).catch(() => defaultAnswers),
      new Promise<typeof defaultAnswers>((resolve) =>
        setTimeout(async () => {
          if (requestID) {
            await Question.reject(requestID).catch(() => {})
          }
          resolve(defaultAnswers)
        }, timeout)
      ),
    ])

    unsub()

    function format(answer: Question.Answer | undefined) {
      if (!answer?.length) return "Unanswered"
      return answer.join(", ")
    }

    const formatted = params.questions.map((q, i) => `"${q.question}"="${format(answers[i])}"`).join(", ")

    return {
      title: `Asked ${params.questions.length} question${params.questions.length > 1 ? "s" : ""}`,
      output: `User has answered your questions: ${formatted}. You can now continue with the user's answers in mind.`,
      metadata: {
        answers,
      },
    }
  },
})
