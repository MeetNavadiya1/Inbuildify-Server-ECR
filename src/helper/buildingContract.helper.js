/**
 * Give every progress payment stage a row id.
 *
 * The id only tells one row from another in the contract editor, so a schedule
 * that arrives without one is still a valid schedule — but storing it keyless
 * leaves the next save in the same state, and two rows sharing an id are one row
 * as far as the editor's table is concerned. Both are settled here, once, on the
 * way in.
 *
 * Anything that is not an array of stages is returned untouched: the save
 * endpoint accepts a partial contract, and a body that never mentions the
 * schedule must not grow one.
 */
export function withStageKeys(data) {
  const stages = data?.progress_payment_stages;
  if (!Array.isArray(stages)) return data;

  const used = new Set();
  return {
    ...data,
    progress_payment_stages: stages.map((stage, index) => {
      let key = typeof stage?.key === "string" ? stage.key.trim() : "";
      if (!key || used.has(key)) {
        key = `stage-${index + 1}`;
        let suffix = 2;
        while (used.has(key)) key = `stage-${index + 1}-${suffix++}`;
      }
      used.add(key);
      return { ...stage, key };
    }),
  };
}

export default { withStageKeys };
