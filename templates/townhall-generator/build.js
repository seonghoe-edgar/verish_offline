const pptxgen = require("pptxgenjs");
const { iconPng, fi } = require("./icons.js");

const C = {
  black: "000000",
  white: "FFFFFF",
  ink: "20242E",
  body: "4A4F5C",
  muted: "8A8D96",
  mutedDark: "9A9CA8",
  card: "F4F5FA",
  accent: "4A5CF5",
  accentSoft: "E4E7FD",
  lavender: "AEB8F4",
};

const PAGE_W = 13.33, PAGE_H = 7.5, MARGIN = 0.7;

async function main() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";

  const icon = {
    target: await iconPng(fi.FiTarget, C.accent),
    eye: await iconPng(fi.FiEye, C.accent),
    layers: await iconPng(fi.FiLayers, C.accent),
    globe: await iconPng(fi.FiGlobe, C.accent),
    bulb: await iconPng(fi.FiZap, C.white),
    image: await iconPng(fi.FiImage, C.muted),
    imageOnDark: await iconPng(fi.FiImage, C.mutedDark),
    users: await iconPng(fi.FiUsers, C.accent),
    mail: await iconPng(fi.FiMail, C.mutedDark),
    trend: await iconPng(fi.FiTrendingUp, C.white),
    check: await iconPng(fi.FiCheck, C.accent),
    bar: await iconPng(fi.FiBarChart2, C.white),
  };

  const label = (s, text, opts = {}) =>
    s.addText(text.toUpperCase(), {
      x: opts.x ?? MARGIN, y: opts.y ?? 0.6, w: opts.w ?? 6, h: 0.4,
      fontFace: "Arial", fontSize: 13, bold: true,
      color: opts.color ?? C.accent, charSpacing: 2,
      isTextBox: true, margin: 0,
    });

  const pageNum = (s, n, dark) =>
    s.addText(String(n).padStart(2, "0"), {
      x: PAGE_W - 1.2, y: PAGE_H - 0.6, w: 0.8, h: 0.35,
      fontFace: "Arial", fontSize: 11, color: dark ? C.mutedDark : C.muted,
      align: "right", isTextBox: true, margin: 0,
    });

  const imgPlaceholder = (s, x, y, w, h, dark, iconData) => {
    s.addShape("roundRect", {
      x, y, w, h, rectRadius: 0.14,
      fill: { color: dark ? "14161C" : C.card }, line: { type: "none" },
    });
    const size = Math.min(w, h) * 0.22;
    s.addImage({ data: iconData, x: x + w / 2 - size / 2, y: y + h / 2 - size / 2, w: size, h: size });
  };

  // ---------- 1. Cover ----------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    s.addShape("ellipse", { x: PAGE_W - 4.6, y: -2.2, w: 6.5, h: 6.5, fill: { color: C.card }, line: { type: "none" } });
    s.addShape("ellipse", { x: PAGE_W - 2.9, y: 0.9, w: 1.7, h: 1.7, fill: { color: C.ink }, line: { type: "none" } });
    s.addShape("roundRect", {
      x: MARGIN, y: 1.35, w: 2.5, h: 0.55, rectRadius: 0.275,
      fill: { color: C.accentSoft }, line: { type: "none" },
    });
    s.addText("TEMPLATE SYSTEM", {
      x: MARGIN, y: 1.35, w: 2.5, h: 0.55, align: "center", valign: "middle",
      fontFace: "Arial", fontSize: 11, bold: true, color: C.accent, charSpacing: 1,
      isTextBox: true, margin: 0,
    });
    s.addText("Verish Offline\nDesign Template", {
      x: MARGIN, y: 2.55, w: 8.5, h: 2.2,
      fontFace: "Arial", fontSize: 48, bold: true, color: C.ink,
      isTextBox: true, margin: 0, lineSpacingMultiple: 1.08,
    });
    s.addText("맞춤 제작을 위한 프레젠테이션 서식 세트 — 커버부터 클로징까지", {
      x: MARGIN, y: 4.75, w: 7.5, h: 0.5,
      fontFace: "Arial", fontSize: 15, color: C.body, isTextBox: true, margin: 0,
    });
    s.addShape("roundRect", {
      x: PAGE_W / 2 - 0.9, y: PAGE_H - 1.15, w: 1.8, h: 0.32, rectRadius: 0.16,
      fill: { color: C.card }, line: { type: "none" },
    });
    s.addText("DEEPDIVE", {
      x: MARGIN, y: PAGE_H - 0.95, w: 3, h: 0.4,
      fontFace: "Arial", fontSize: 12, bold: true, color: C.ink, charSpacing: 2,
      isTextBox: true, margin: 0,
    });
  }

  // ---------- 2. Contents ----------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    s.addShape("ellipse", {
      x: MARGIN, y: 2.0, w: 3.4, h: 3.4, fill: { color: C.accent }, line: { type: "none" },
    });
    s.addText("CONTENTS", {
      x: MARGIN, y: 2.0, w: 3.4, h: 3.4, align: "center", valign: "middle",
      fontFace: "Arial", fontSize: 20, bold: true, color: C.white, charSpacing: 1,
      isTextBox: true, margin: 0,
    });
    const items = [
      ["01", "Our Vision", "우리가 만들고자 하는 것"],
      ["02", "Development", "지금까지의 진행 상황"],
      ["03", "Our Team", "함께하는 사람들"],
      ["04", "Platform & Logistics", "운영 기반과 확장 계획"],
    ];
    const rx = 4.9, rw = 7.7, rh = 1.0, ry0 = 1.55, gap = 0.18;
    items.forEach((it, i) => {
      const y = ry0 + i * (rh + gap);
      s.addText(it[0], {
        x: rx, y, w: 0.9, h: rh, valign: "middle",
        fontFace: "Arial", fontSize: 22, bold: true, color: C.accent,
        isTextBox: true, margin: 0,
      });
      s.addText(it[1], {
        x: rx + 0.95, y, w: rw - 0.95, h: rh * 0.6, valign: "bottom",
        fontFace: "Arial", fontSize: 19, bold: true, color: C.ink,
        isTextBox: true, margin: 0,
      });
      s.addText(it[2], {
        x: rx + 0.95, y: y + rh * 0.6, w: rw - 0.95, h: rh * 0.4, valign: "top",
        fontFace: "Arial", fontSize: 12.5, color: C.muted,
        isTextBox: true, margin: 0,
      });
    });
    pageNum(s, 2, false);
  }

  // ---------- 3. Welcome ----------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    s.addShape("ellipse", { x: MARGIN, y: 0.65, w: 0.85, h: 0.85, fill: { color: C.ink }, line: { type: "none" } });
    s.addImage({ data: icon.bulb, x: MARGIN + 0.23, y: 0.88, w: 0.4, h: 0.4 });
    s.addText("Welcome", {
      x: MARGIN, y: 1.75, w: 8, h: 0.9,
      fontFace: "Arial", fontSize: 38, bold: true, color: C.ink, isTextBox: true, margin: 0,
    });
    s.addText(
      "이 템플릿은 오프라인 리테일 프로젝트를 위한 기본 프레젠테이션 서식입니다.\n" +
      "커버, 목차, 소개, 기능 소개, 데이터, 팀 소개, 클로징까지 하나의 톤으로 구성했습니다.",
      {
        x: MARGIN, y: 2.75, w: 7.2, h: 1.3,
        fontFace: "Arial", fontSize: 14.5, color: C.body, isTextBox: true, margin: 0,
        lineSpacingMultiple: 1.35,
      }
    );
    s.addShape("roundRect", {
      x: 8.6, y: 1.75, w: 4.0, h: 3.3, rectRadius: 0.14,
      fill: { color: C.card }, line: { type: "none" },
    });
    [["색상", "Black · Indigo · Lavender"], ["레이아웃", "13.33 × 7.5 in (16:9)"], ["폰트", "Arial"]].forEach((row, i) => {
      const y = 2.1 + i * 1.0;
      s.addText(row[0], {
        x: 8.95, y, w: 3.3, h: 0.35,
        fontFace: "Arial", fontSize: 11, bold: true, color: C.accent, charSpacing: 1,
        isTextBox: true, margin: 0,
      });
      s.addText(row[1], {
        x: 8.95, y: y + 0.35, w: 3.3, h: 0.4,
        fontFace: "Arial", fontSize: 14, color: C.ink, isTextBox: true, margin: 0,
      });
    });
    pageNum(s, 3, false);
  }

  // ---------- 4. Introduction ----------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    imgPlaceholder(s, MARGIN, 1.5, 5.6, 4.6, false, icon.image);
    s.addShape("ellipse", { x: MARGIN + 5.6 - 1.55, y: 1.5 + 4.6 - 1.55, w: 2.0, h: 2.0, fill: { color: C.accent }, line: { type: "none" } });
    s.addText("OUR\nVISION", {
      x: MARGIN + 5.6 - 1.55, y: 1.5 + 4.6 - 1.55, w: 2.0, h: 2.0, align: "center", valign: "middle",
      fontFace: "Arial", fontSize: 15, bold: true, color: C.white, isTextBox: true, margin: 0, lineSpacingMultiple: 1.05,
    });
    label(s, "Introduction", { x: 7.0, y: 1.5, w: 5 });
    s.addText("매장의 경험이 브랜드를\n완성합니다", {
      x: 7.0, y: 1.95, w: 5.6, h: 1.5,
      fontFace: "Arial", fontSize: 27, bold: true, color: C.ink, isTextBox: true, margin: 0, lineSpacingMultiple: 1.1,
    });
    s.addText(
      "온라인에서 시작한 브랜드 경험을 오프라인 매장으로 확장하고, " +
      "다시 데이터로 온라인 성과를 끌어올리는 순환 구조를 만듭니다.",
      {
        x: 7.0, y: 3.5, w: 5.5, h: 1.3,
        fontFace: "Arial", fontSize: 14, color: C.body, isTextBox: true, margin: 0, lineSpacingMultiple: 1.35,
      }
    );
    pageNum(s, 4, false);
  }

  // ---------- 5. Feature icon row ----------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    label(s, "What we focus on");
    s.addText("네 가지 핵심 요소", {
      x: MARGIN, y: 1.05, w: 10, h: 0.8,
      fontFace: "Arial", fontSize: 32, bold: true, color: C.ink, isTextBox: true, margin: 0,
    });
    const feats = [
      { ic: icon.target, t: "Focus", d: "명확한 목표 설정" },
      { ic: icon.eye, t: "Vision", d: "일관된 브랜드 경험" },
      { ic: icon.layers, t: "Depth", d: "거점 단위의 밀도" },
      { ic: icon.globe, t: "Scale", d: "반복 가능한 확장" },
    ];
    const colW = 2.85, gap = 0.25, y0 = 2.55, circleD = 1.15;
    feats.forEach((f, i) => {
      const x = MARGIN + i * (colW + gap);
      s.addShape("ellipse", { x: x + colW / 2 - circleD / 2, y: y0, w: circleD, h: circleD, fill: { color: C.card }, line: { type: "none" } });
      s.addImage({ data: f.ic, x: x + colW / 2 - 0.28, y: y0 + circleD / 2 - 0.28, w: 0.56, h: 0.56 });
      s.addText(f.t, {
        x, y: y0 + circleD + 0.25, w: colW, h: 0.5, align: "center",
        fontFace: "Arial", fontSize: 18, bold: true, color: C.ink, isTextBox: true, margin: 0,
      });
      s.addText(f.d, {
        x, y: y0 + circleD + 0.75, w: colW, h: 0.6, align: "center",
        fontFace: "Arial", fontSize: 12.5, color: C.muted, isTextBox: true, margin: 0,
      });
    });
    pageNum(s, 5, false);
  }

  // ---------- 6. Donut stat pair ----------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    label(s, "Company Vision");
    s.addText("두 가지 지표로 보는 진행률", {
      x: MARGIN, y: 1.05, w: 10, h: 0.8,
      fontFace: "Arial", fontSize: 32, bold: true, color: C.ink, isTextBox: true, margin: 0,
    });
    const donuts = [
      { v: 60, l: "Operations", x: 2.3 },
      { v: 80, l: "Environment", x: 7.3 },
    ];
    donuts.forEach((d) => {
      s.addChart("doughnut", [{ name: d.l, labels: [d.l, ""], values: [d.v, 100 - d.v] }], {
        x: d.x, y: 2.35, w: 3.6, h: 3.6,
        chartColors: [C.accent, C.card],
        showLegend: false, showTitle: false, showValue: false,
        dataBorder: { pt: 0, color: C.white },
        holeSize: 68,
      });
      s.addText(`${d.v}%`, {
        x: d.x, y: 2.35 + 3.6 / 2 - 0.4, w: 3.6, h: 0.8, align: "center",
        fontFace: "Arial", fontSize: 30, bold: true, color: C.ink, isTextBox: true, margin: 0,
      });
      s.addText(d.l, {
        x: d.x, y: 2.35 + 3.6 + 0.15, w: 3.6, h: 0.4, align: "center",
        fontFace: "Arial", fontSize: 14, color: C.muted, isTextBox: true, margin: 0,
      });
    });
    pageNum(s, 6, false);
  }

  // ---------- 7. Two-column image + text ----------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    label(s, "Case");
    s.addText("성수 플래그십 매장", {
      x: MARGIN, y: 1.05, w: 6, h: 0.8,
      fontFace: "Arial", fontSize: 30, bold: true, color: C.ink, isTextBox: true, margin: 0,
    });
    s.addText(
      "주요 거점마다 연 100억 이상의 메가 플래그십을 성공적으로 런칭하고, " +
      "확산 가능한 매장 포맷으로 온라인이 닿지 못하는 커버리지를 확보합니다.",
      {
        x: MARGIN, y: 2.1, w: 5.4, h: 1.6,
        fontFace: "Arial", fontSize: 14, color: C.body, isTextBox: true, margin: 0, lineSpacingMultiple: 1.35,
      }
    );
    s.addShape("roundRect", {
      x: MARGIN, y: 4.0, w: 2.0, h: 0.55, rectRadius: 0.275,
      fill: { color: C.accentSoft }, line: { type: "none" },
    });
    s.addText("CASE 01", {
      x: MARGIN, y: 4.0, w: 2.0, h: 0.55, align: "center", valign: "middle",
      fontFace: "Arial", fontSize: 12, bold: true, color: C.accent, isTextBox: true, margin: 0,
    });
    imgPlaceholder(s, 7.1, 1.05, 5.55, 5.6, false, icon.image);
    pageNum(s, 7, false);
  }

  // ---------- 8. Full-bleed image overlay ----------
  {
    const s = pres.addSlide();
    s.background = { color: C.ink };
    imgPlaceholder(s, 0, 0, PAGE_W, PAGE_H, true, icon.imageOnDark);
    s.addText("Creative presentation design", {
      x: MARGIN, y: PAGE_H - 1.9, w: 9, h: 1.1,
      fontFace: "Arial", fontSize: 34, bold: true, color: C.white, isTextBox: true, margin: 0,
    });
    pageNum(s, 8, true);
  }

  // ---------- 9. Triple ring stats ----------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    label(s, "Snapshot");
    s.addText("세 가지 스냅샷", {
      x: MARGIN, y: 1.05, w: 10, h: 0.8,
      fontFace: "Arial", fontSize: 32, bold: true, color: C.ink, isTextBox: true, margin: 0,
    });
    const rings = [
      { v: 72, l: "브랜드 인지도" },
      { v: 45, l: "매장 재방문율" },
      { v: 88, l: "고객 만족도" },
    ];
    const w = 2.2, gap = 0.5, total = w * 3 + gap * 2, x0 = (PAGE_W - total) / 2, y0 = 2.5;
    rings.forEach((r, i) => {
      const x = x0 + i * (w + gap);
      s.addChart("doughnut", [{ name: r.l, labels: [r.l, ""], values: [r.v, 100 - r.v] }], {
        x, y: y0, w, h: w,
        chartColors: [C.accent, C.card],
        showLegend: false, showTitle: false, showValue: false,
        dataBorder: { pt: 0, color: C.white },
        holeSize: 70,
      });
      s.addText(`${r.v}%`, {
        x, y: y0 + w / 2 - 0.28, w, h: 0.55, align: "center",
        fontFace: "Arial", fontSize: 19, bold: true, color: C.ink, isTextBox: true, margin: 0,
      });
      s.addText(r.l, {
        x, y: y0 + w + 0.2, w, h: 0.4, align: "center",
        fontFace: "Arial", fontSize: 13, color: C.muted, isTextBox: true, margin: 0,
      });
    });
    pageNum(s, 9, false);
  }

  // ---------- 10. Dark business slide ----------
  {
    const s = pres.addSlide();
    s.background = { color: C.black };
    label(s, "Business Overview", { color: C.lavender });
    s.addText("월별 오프라인 매출 추이", {
      x: MARGIN, y: 1.05, w: 6, h: 0.8,
      fontFace: "Arial", fontSize: 28, bold: true, color: C.white, isTextBox: true, margin: 0,
    });
    const pillLabels = ["매장 경험 강화", "데이터 기반 운영", "글로벌 확산 준비"];
    pillLabels.forEach((t, i) => {
      const y = 2.35 + i * 0.85;
      s.addShape("roundRect", {
        x: MARGIN, y, w: 4.6, h: 0.6, rectRadius: 0.3,
        fill: { color: "14161C" }, line: { type: "none" },
      });
      s.addImage({ data: icon.check, x: MARGIN + 0.22, y: y + 0.16, w: 0.28, h: 0.28 });
      s.addText(t, {
        x: MARGIN + 0.65, y, w: 3.8, h: 0.6, valign: "middle",
        fontFace: "Arial", fontSize: 14.5, color: C.white, isTextBox: true, margin: 0,
      });
    });
    s.addChart("bar", [{ name: "매출", labels: ["1월", "2월", "3월", "4월", "5월"], values: [32, 38, 41, 52, 61] }], {
      x: 6.4, y: 2.1, w: 6.2, h: 4.3,
      chartColors: [C.accent],
      showLegend: false, showTitle: true, title: "Monthly Sales Index",
      titleColor: C.white, titleFontSize: 13,
      showValue: true, dataLabelColor: C.white, dataLabelFontSize: 10, dataLabelPosition: "outEnd",
      catAxisLabelColor: C.mutedDark, valAxisLabelColor: C.mutedDark,
      valAxisHidden: true, catGridLine: { style: "none" }, valGridLine: { style: "none" },
      barGapWidthPct: 45,
    });
    pageNum(s, 10, true);
  }

  // ---------- 11. Team ----------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    label(s, "Our Team");
    s.addText("함께 만드는 사람들", {
      x: MARGIN, y: 1.05, w: 8, h: 0.8,
      fontFace: "Arial", fontSize: 30, bold: true, color: C.ink, isTextBox: true, margin: 0,
    });
    imgPlaceholder(s, MARGIN, 2.15, 3.0, 3.0, false, icon.users);
    s.addText("Lisa Anna", {
      x: MARGIN, y: 5.3, w: 3.0, h: 0.4, align: "center",
      fontFace: "Arial", fontSize: 17, bold: true, color: C.ink, isTextBox: true, margin: 0,
    });
    s.addText("Creative Director", {
      x: MARGIN, y: 5.72, w: 3.0, h: 0.35, align: "center",
      fontFace: "Arial", fontSize: 12, color: C.muted, isTextBox: true, margin: 0,
    });
    const mini = ["Kim", "Park", "Choi"];
    mini.forEach((name, i) => {
      const x = 4.6 + i * 2.85;
      s.addShape("ellipse", { x, y: 2.4, w: 1.5, h: 1.5, fill: { color: C.card }, line: { type: "none" } });
      s.addImage({ data: icon.users, x: x + 0.42, y: 2.82, w: 0.66, h: 0.66 });
      s.addText(name, {
        x: x - 0.4, y: 4.05, w: 2.3, h: 0.35, align: "center",
        fontFace: "Arial", fontSize: 14, bold: true, color: C.ink, isTextBox: true, margin: 0,
      });
      s.addText("Team Member", {
        x: x - 0.4, y: 4.4, w: 2.3, h: 0.3, align: "center",
        fontFace: "Arial", fontSize: 11, color: C.muted, isTextBox: true, margin: 0,
      });
    });
    pageNum(s, 11, false);
  }

  // ---------- 12. Closing ----------
  {
    const s = pres.addSlide();
    s.background = { color: C.black };
    s.addShape("ellipse", { x: -1.8, y: PAGE_H - 3.2, w: 5.5, h: 5.5, fill: { color: "14161C" }, line: { type: "none" } });
    s.addShape("ellipse", { x: PAGE_W - 3.0, y: -1.6, w: 2.2, h: 2.2, fill: { color: C.accent }, line: { type: "none" } });
    s.addText([
      { text: "Thank ", options: { color: C.white } },
      { text: "you", options: { color: C.lavender } },
    ], {
      x: MARGIN, y: 2.9, w: 10, h: 1.3,
      fontFace: "Arial", fontSize: 50, bold: true, isTextBox: true, margin: 0,
    });
    s.addImage({ data: icon.mail, x: MARGIN, y: 4.25, w: 0.3, h: 0.3 });
    s.addText("sh.gu@deep-dive.kr", {
      x: MARGIN + 0.42, y: 4.2, w: 6, h: 0.4,
      fontFace: "Arial", fontSize: 15, color: C.mutedDark, isTextBox: true, margin: 0,
    });
    s.addText("DEEPDIVE", {
      x: MARGIN, y: PAGE_H - 0.9, w: 3, h: 0.4,
      fontFace: "Arial", fontSize: 13, bold: true, color: C.white, charSpacing: 2,
      isTextBox: true, margin: 0,
    });
  }

  await pres.writeFile({ fileName: "../townhall-template.pptx" });
  console.log("written");
}

main().catch((e) => { console.error(e); process.exit(1); });
