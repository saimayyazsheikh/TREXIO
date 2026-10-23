import "server-only";
import { adminDb } from "@/lib/server/admin";
import { cloudProvider, mockProvider, type WaDeps } from "@/lib/server/whatsapp";

/** WhatsApp wired to the real project. WHATSAPP_PROVIDER=cloud sends through Meta; anything else is the safe mock. */
export function realWhatsApp(): WaDeps {
  const useCloud = process.env.WHATSAPP_PROVIDER === "cloud" && !!process.env.WHATSAPP_TOKEN && !!process.env.WHATSAPP_PHONE_NUMBER_ID;
  return {
    provider: useCloud ? cloudProvider({ token: process.env.WHATSAPP_TOKEN!, phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID! }) : mockProvider(),
    templates: {
      nudge: process.env.WHATSAPP_TEMPLATE_TASK_NUDGE ?? "",
      briefing: process.env.WHATSAPP_TEMPLATE_MORNING_BRIEFING ?? "",
      escalation: process.env.WHATSAPP_TEMPLATE_ESCALATION_ALERT ?? "",
      summary: process.env.WHATSAPP_TEMPLATE_WEEKLY_SUMMARY ?? "",
    },
    now: () => new Date(),
    writeLog: async (entry) => (await adminDb().collection("whatsappLogs").add(entry)).id,
  };
}
