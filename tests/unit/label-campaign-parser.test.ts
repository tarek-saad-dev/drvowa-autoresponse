import { describe, expect, it } from "vitest";
import {
  parseLabelCampaignCommand, type LabelCampaignTarget,
} from "@/modules/messaging/label-campaign-parser";

const labels: LabelCampaignTarget[] = [
  { id: "coach", name: "Coach", channelConnectionId: "channel-one", deleted: false, observedContacts: 21 },
  { id: "clinic", name: "Clinic", channelConnectionId: "channel-one", deleted: false, observedContacts: 13 },
  { id: "old", name: "Old", channelConnectionId: "channel-one", deleted: true, observedContacts: 100 },
];

describe("owner label campaign command parser", () => {
  it("recognizes one Arabic request without inventing a message", () => {
    const drafts = parseLabelCampaignCommand(
      "ابعت للناس اللي في list Coach إن فيه سيشن جديد يوم الجمعة", labels,
    );
    expect(drafts).toEqual([{
      label: labels[0],
      messageText: "فيه سيشن جديد يوم الجمعة",
    }]);
  });

  it("previews separate messages for two existing labels", () => {
    const drafts = parseLabelCampaignCommand(
      "ابعت للناس اللي في Coach إن فيه سيشن الجمعة، وللناس اللي في Clinic إن الحجز مفتوح الأسبوع ده",
      labels,
    );
    expect(drafts.map(x => [x.label.name, x.messageText])).toEqual([
      ["Coach", "فيه سيشن الجمعة"],
      ["Clinic", "الحجز مفتوح الأسبوع ده"],
    ]);
  });

  it("fails closed for missing, duplicate, deleted or ambiguous labels", () => {
    expect(() => parseLabelCampaignCommand("ابعت لعملاء Unknown رسالة الحجز مفتوح", labels)).toThrow();
    expect(() => parseLabelCampaignCommand("ابعت للناس في Old إن فيه عرض", labels)).toThrow();
    expect(() => parseLabelCampaignCommand("ابعت للناس في Coach إن فيه عرض وابعث لCoach رسالة تانية", labels)).toThrow();
    expect(() => parseLabelCampaignCommand("ابعت للناس في Coach إن فيه عرض", [
      ...labels, { id: "same", name: "Coach", channelConnectionId: "channel-two",
        observedContacts: 5, deleted: false },
    ])).toThrow();
  });

  it("rejects commands without an explicit send intent or valid message text", () => {
    expect(() => parseLabelCampaignCommand("Coach عنده سيشن جديد الأسبوع ده", labels)).toThrow();
    expect(() => parseLabelCampaignCommand("ابعت للناس اللي في Coach", labels)).toThrow();
    expect(() => parseLabelCampaignCommand("ابعت للناس في Coach ١", labels)).toThrow();
  });
});
