import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CampaignLabelChoices, CampaignLabelPicker, type MirroredWhatsAppLabel,
} from "@/components/dashboard/campaign-label-picker";

const example: MirroredWhatsAppLabel[] = [
  {channelConnectionId:"a",id:"1",name:"VIP",color:1,deleted:false,observedContacts:7},
  {channelConnectionId:"a",id:"2",name:"Protein",color:2,deleted:false,observedContacts:0},
  {channelConnectionId:"a",id:"3",name:"Deleted",color:3,deleted:true,observedContacts:200},
];

describe("WhatsApp campaign label discovery",()=>{
  it("makes list discovery and real WhatsApp Business setup discoverable",()=>{
    const html=renderToStaticMarkup(<CampaignLabelPicker onPick={()=>{}}/>);
    expect(html).toContain("قوائم عملائك على واتساب");
    expect(html).toContain("إزاي أعمل قائمة جديدة");
    expect(html).toContain("WhatsApp Business");
    expect(html).toContain("تحديث");
  });
  it("offers valid mirrored lists with observed counts without surfacing deleted lists",()=>{
    const html=renderToStaticMarkup(<CampaignLabelChoices labels={example} onPick={()=>{}}/>);
    expect(html).toContain("جهز رسالة لقائمة VIP");
    expect(html).toContain("جهز رسالة لقائمة Protein");
    expect(html).toContain("٧");
    expect(html).not.toContain("Deleted");
  });
  it("refuses to silently choose between identical names on different accounts",()=>{
    const html=renderToStaticMarkup(<CampaignLabelChoices
      labels={[example[0], {...example[0],channelConnectionId:"b",id:"another"}]}
      onPick={()=>{}}/>);
    expect(html).toContain("الاسم مكرر على أكثر من رقم");
    expect(html.match(/disabled=""/g)?.length).toBe(2);
  });
});
