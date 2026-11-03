import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CampaignLabelChoices, CampaignLabelPicker, type MirroredWhatsAppLabel,
} from "@/components/dashboard/campaign-label-picker";

const example: MirroredWhatsAppLabel[] = [
  {channelConnectionId:"a",id:"1",name:"VIP",color:1,deleted:false,observedContacts:7,source:"DRVO"},
  {channelConnectionId:"a",id:"2",name:"Protein",color:2,deleted:false,observedContacts:0,source:"WHATSAPP"},
  {channelConnectionId:"a",id:"3",name:"Deleted",color:3,deleted:true,observedContacts:200},
];

describe("simple campaign audience selector",()=>{
  it("shows a compact list choice and a separate management action",()=>{
    const html=renderToStaticMarkup(<CampaignLabelPicker onPick={()=>{}} onManage={()=>{}}/>);
    expect(html).toContain("اختار القائمة اللي هتبعت لها");
    expect(html).toContain("إدارة القوائم");
    expect(html).toContain("تحديث");
    expect(html).not.toContain("إضافة عملاء إلى");
    expect(html).not.toContain("اختبار إرسال على رقم واحد");
  });
  it("shows list management only in the separate management view",()=>{
    const html=renderToStaticMarkup(<CampaignLabelPicker
      mode="manage" onPick={()=>{}} onBack={()=>{}}/>);
    expect(html).toContain("قوائم DRVO");
    expect(html).toContain("+ قائمة جديدة");
    expect(html).toContain("WhatsApp Business");
    expect(html).toContain("رجوع للحملة");
  });
  it("offers valid mirrored labels with their sources and counts",()=>{
    const html=renderToStaticMarkup(<CampaignLabelChoices labels={example} onPick={()=>{}}/>);
    expect(html).toContain("جهز رسالة لقائمة VIP");
    expect(html).toContain("جهز رسالة لقائمة Protein");
    expect(html).toContain("٧");
    expect(html).toContain("قائمة واتساب");
    expect(html).toContain("قائمة DRVO");
    expect(html).not.toContain("Deleted");
  });
  it("does not confuse same-named lists on different accounts: IDs are the chosen identity",()=>{
    const html=renderToStaticMarkup(<CampaignLabelChoices
      labels={[example[0], {...example[0],channelConnectionId:"b",id:"another"}]}
      onPick={()=>{}}/>);
    expect(html.match(/aria-label="جهز رسالة لقائمة VIP"/g)?.length).toBe(2);
    expect(html).not.toContain("disabled=");
  });
});
