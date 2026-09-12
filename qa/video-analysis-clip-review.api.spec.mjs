import { test, expect } from "@playwright/test";
import { createClipReview, renderClipReview } from "../src/modules/video-analysis/timeline/timeline.clip-review.js";

const clips = [{ id: "b", revision: 2, startMs: 5000, endMs: 9000 }, { id: "a", revision: 3, startMs: 1000, endMs: 3000 }];

test("row review keeps a chronological unique snapshot without mutating source clips", () => {
  const review = createClipReview([...clips, clips[0]], "High Press");
  expect(review.entries.map(entry => entry.clip.id)).toEqual(["a", "b"]);
  review.entries[0].clip.startMs = 1500;
  expect(clips[1].startMs).toBe(1000);
  expect(createClipReview([null, {}, { id: "" }]).entries).toEqual([]);
});

test("row review drafts stay separate and retain original revisions until each clip is saved", () => {
  const review = createClipReview(clips);
  const baseline = { fields: { note: "" }, principles: [] };
  const a = { fields: { note: "A", endMs: "invalid" }, principles: ["support"] };
  const b = { fields: { note: "B" }, principles: ["press"] };
  review.remember("a", a, baseline);
  review.remember("b", b, baseline);
  a.fields.note = "Mutated outside";
  expect(review.entries[0]).toMatchObject({ clip: { id: "a", revision: 3 }, draft: { fields: { note: "A", endMs: "invalid" } } });
  review.saved({ ...clips[0], revision: 3 });
  expect(review.entries[1]).toMatchObject({ clip: { revision: 3 }, draft: null });
  expect(review.hasDrafts()).toBe(true);
  review.remember("a", baseline, baseline);
  expect(review.hasDrafts()).toBe(false);
});

test("row review removes only the requested clip and chooses a remaining neighbor", () => {
  const review = createClipReview(clips);
  expect(review.remove("a").id).toBe("b");
  expect(review.entries.map(entry => entry.clip.id)).toEqual(["b"]);
  expect(review.remove("not-present")).toBeNull();
  expect(review.remove("b")).toBeNull();
  expect(review.entries).toEqual([]);
});

test("saving new times reorders the review without losing another clip's draft", () => {
  const review = createClipReview(clips);
  review.remember("b", { fields: { note: "Keep this" }, principles: [] }, {});
  review.saved({ ...clips[1], revision: 4, startMs: 10000, endMs: 12000 });
  expect(review.entries.map(entry => entry.clip.id)).toEqual(["b", "a"]);
  expect(review.entries[0].draft.fields.note).toBe("Keep this");
  expect(review.entries[1]).toMatchObject({ clip: { id: "a", revision: 4 }, draft: null });
  expect(clips[1].startMs).toBe(1000);
});

test("a single clip uses the same numbered strip with no unrelated clips", () => {
  const html = renderClipReview(null, "a", clips[1]);
  expect(html.match(/data-clip-review-select=/g)).toHaveLength(1);
  expect(html).toContain('data-clip-review-select="a" aria-pressed="true"');
  expect(html).toContain("0:00:01 - 0:00:03");
  expect(html).toContain('title="Previous clip" disabled');
  expect(html).toContain('title="Next clip" disabled');
  expect(renderClipReview(null, "a")).toBe("");
});

test("row review navigation escapes labels and exposes selection and unsaved state", () => {
  const review = createClipReview([{ ...clips[0], id: 'x" onclick="bad()' }], '<img src=x>');
  review.remember(review.entries[0].clip.id, { note: "changed" }, {});
  const html = renderClipReview(review, review.entries[0].clip.id);
  expect(html).not.toContain("<img");
  expect(html).not.toContain(' onclick="bad()');
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain("Unsaved");
  expect(html).toContain('title="Previous clip" disabled');
  expect(html).toContain('title="Next clip" disabled');
});
