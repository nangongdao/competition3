import { describe, expect, it } from "vitest";

import {
  annotationToPixels,
  hasSpatialAnnotations,
  parseSpatialAnnotations,
  stripSpatialAnnotations,
  type SpatialAnnotation,
} from "./spatial-annotation";

describe("parseSpatialAnnotations", () => {
  it("解析标准的标注块", () => {
    const text = `答案：画面里有一杯茶。
[ANNOTATIONS]
[{"label":"茶杯","box":{"x":0.2,"y":0.3,"w":0.3,"h":0.4}}]
[/ANNOTATIONS]`;

    const result = parseSpatialAnnotations(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      label: "茶杯",
      box: { x: 0.2, y: 0.3, w: 0.3, h: 0.4 },
    });
  });

  it("解析多个标注", () => {
    const text = `[ANNOTATIONS]
[
  {"label":"杯子","box":{"x":0.1,"y":0.1,"w":0.2,"h":0.2}},
  {"label":"书","box":{"x":0.6,"y":0.5,"w":0.3,"h":0.2}}
]
[/ANNOTATIONS]`;

    const result = parseSpatialAnnotations(text);
    expect(result).toHaveLength(2);
    expect(result.map((item) => item.label)).toEqual(["杯子", "书"]);
  });

  it("无标注块时返回空数组", () => {
    expect(parseSpatialAnnotations("只有纯文本，没有标注。")).toEqual([]);
  });

  it("空字符串返回空数组", () => {
    expect(parseSpatialAnnotations("")).toEqual([]);
    expect(parseSpatialAnnotations("   ")).toEqual([]);
  });

  it("标注块 JSON 非法时返回空数组", () => {
    const text = `[ANNOTATIONS]
not-json
[/ANNOTATIONS]`;
    expect(parseSpatialAnnotations(text)).toEqual([]);
  });

  it("JSON 不是数组时返回空数组", () => {
    const text = `[ANNOTATIONS]
{"label":"x"}
[/ANNOTATIONS]`;
    expect(parseSpatialAnnotations(text)).toEqual([]);
  });

  it("坐标越界被钳制到 [0,1] 视口内", () => {
    const text = `[ANNOTATIONS]
[{"label":"越界","box":{"x":1.5,"y":-0.5,"w":2,"h":1}}]
[/ANNOTATIONS]`;

    const result = parseSpatialAnnotations(text);
    expect(result).toHaveLength(1);
    const box = result[0].box;
    // 框范围 x∈[1.5,3.5] → 完全出屏右侧（x=1,w=0）；y∈[-0.5,0.5] → 可见 y∈[0,0.5]。
    expect(box.x).toBe(1);
    expect(box.y).toBe(0);
    expect(box.w).toBe(0);
    expect(box.h).toBe(0.5);
  });

  it("丢弃非法条目并保留合法条目", () => {
    const text = `[ANNOTATIONS]
[
  {"label":"合法","box":{"x":0.1,"y":0.1,"w":0.2,"h":0.2}},
  {"label":"缺框"},
  {"box":{"x":0.1,"y":0.1,"w":0.2,"h":0.2}}
]
[/ANNOTATIONS]`;

    const result = parseSpatialAnnotations(text);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("合法");
  });

  it("丢弃非 number 坐标的标注", () => {
    const text = `[ANNOTATIONS]
[{"label":"坏坐标","box":{"x":"0.1","y":0.1,"w":0.2,"h":0.2}}]
[/ANNOTATIONS]`;
    expect(parseSpatialAnnotations(text)).toEqual([]);
  });

  it("裁剪超长标签", () => {
    const longLabel = "x".repeat(200);
    const text = `[ANNOTATIONS]
[{"label":"${longLabel}","box":{"x":0.1,"y":0.1,"w":0.2,"h":0.2}}]
[/ANNOTATIONS]`;

    const result = parseSpatialAnnotations(text);
    expect(result[0].label.length).toBe(120);
  });

  it("标注块 JSON 超长时返回空数组", () => {
    const longJson = JSON.stringify(
      Array.from({ length: 3000 }, (_, index) => ({
        label: `item-${index}`,
        box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
      })),
    );
    const text = `[ANNOTATIONS]${longJson}[/ANNOTATIONS]`;
    expect(parseSpatialAnnotations(text)).toEqual([]);
  });

  it("标注条数超过上限时截断", () => {
    const items = Array.from({ length: 30 }, (_, index) => ({
      label: `item-${index}`,
      box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    }));
    const text = `[ANNOTATIONS]${JSON.stringify(items)}[/ANNOTATIONS]`;
    const result = parseSpatialAnnotations(text);
    expect(result).toHaveLength(12);
  });

  it("没有结束标记时返回空数组", () => {
    const text = `[ANNOTATIONS]
[{"label":"x","box":{"x":0.1,"y":0.1,"w":0.2,"h":0.2}}]`;
    expect(parseSpatialAnnotations(text)).toEqual([]);
  });
});

describe("stripSpatialAnnotations", () => {
  it("移除标注块，保留答案文本", () => {
    const text = `答案：那杯茶在画面左侧。
[ANNOTATIONS]
[{"label":"茶杯","box":{"x":0.2,"y":0.3,"w":0.3,"h":0.4}}]
[/ANNOTATIONS]`;

    expect(stripSpatialAnnotations(text)).toBe("答案：那杯茶在画面左侧。");
  });

  it("无标注块时原样返回", () => {
    const text = "纯文本回答";
    expect(stripSpatialAnnotations(text)).toBe(text);
  });

  it("标注块在开头时剥离后保留后续内容", () => {
    const text = `[ANNOTATIONS]
[{"label":"x","box":{"x":0.1,"y":0.1,"w":0.2,"h":0.2}}]
[/ANNOTATIONS]
后续文本`;
    expect(stripSpatialAnnotations(text)).toBe("后续文本");
  });

  it("缺结束标记时不剥离", () => {
    const text = `[ANNOTATIONS]未完`;
    expect(stripSpatialAnnotations(text)).toBe(text);
  });

  it("空字符串原样返回", () => {
    expect(stripSpatialAnnotations("")).toBe("");
  });
});

describe("hasSpatialAnnotations", () => {
  it("有标注返回 true", () => {
    const text = `[ANNOTATIONS]
[{"label":"x","box":{"x":0.1,"y":0.1,"w":0.2,"h":0.2}}]
[/ANNOTATIONS]`;
    expect(hasSpatialAnnotations(text)).toBe(true);
  });

  it("无标注返回 false", () => {
    expect(hasSpatialAnnotations("纯文本")).toBe(false);
  });
});

describe("annotationToPixels", () => {
  it("按容器尺寸换算像素坐标", () => {
    const annotation: SpatialAnnotation = {
      label: "茶杯",
      box: { x: 0.25, y: 0.5, w: 0.5, h: 0.25 },
    };

    expect(annotationToPixels(annotation, 800, 600)).toEqual({
      left: 200,
      top: 300,
      width: 400,
      height: 150,
    });
  });

  it("尺寸为 0 时回退到安全值", () => {
    const annotation: SpatialAnnotation = {
      label: "x",
      box: { x: 0, y: 0, w: 0.5, h: 0.5 },
    };

    expect(annotationToPixels(annotation, 0, 0)).toEqual({
      left: 0,
      top: 0,
      width: 0.5,
      height: 0.5,
    });
  });
});
