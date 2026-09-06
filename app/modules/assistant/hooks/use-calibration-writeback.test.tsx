import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import { buildCalibrationViewModel } from "@/modules/assistant/lib/calibration-store";
import { EMPTY_CALIBRATION_WRITEBACK } from "@/modules/assistant/lib/calibration-writeback";
import type { CalibrationSample } from "@/modules/assistant/lib/cost-calibration";
import {
  useCalibrationWriteback,
  type UseCalibrationWritebackResult,
} from "./use-calibration-writeback";

let captured: UseCalibrationWritebackResult | undefined;

function sample(
  label: string,
  estimatedUsd: number,
  measuredUsd: number,
  recordedAt = 1000,
): CalibrationSample {
  return { label, estimatedUsd, measuredUsd, recordedAt };
}

function Harness(props: {
  isLoaded: boolean;
  samples: readonly CalibrationSample[];
}): React.JSX.Element {
  const result = useCalibrationWriteback({
    isLoaded: props.isLoaded,
    viewModel: buildCalibrationViewModel(props.samples),
  });
  captured = result;
  return <div data-testid="captured" />;
}

function getResult(): UseCalibrationWritebackResult {
  if (captured === undefined) {
    throw new Error("useCalibrationWriteback 未被捕获");
  }
  return captured;
}

describe("useCalibrationWriteback", () => {
  beforeEach(() => {
    captured = undefined;
  });

  it("returns empty writeback and no suggested factor with no samples", () => {
    renderToStaticMarkup(<Harness isLoaded={true} samples={[]} />);
    const result = getResult();
    expect(result.writeback).toEqual(EMPTY_CALIBRATION_WRITEBACK);
    expect(result.suggestedFactor).toBeNull();
  });

  it("suggests no factor when deviation within tolerance", () => {
    renderToStaticMarkup(
      <Harness isLoaded={true} samples={[sample("a", 100, 108)]} />,
    );
    expect(getResult().suggestedFactor).toBeNull();
  });

  it("suggests a correction factor when deviation exceeds tolerance", () => {
    renderToStaticMarkup(
      <Harness isLoaded={true} samples={[sample("a", 100, 150)]} />,
    );
    expect(getResult().suggestedFactor).toBeCloseTo(1.5, 5);
  });

  it("suggests a sub-1 factor for under-estimation", () => {
    renderToStaticMarkup(
      <Harness isLoaded={true} samples={[sample("a", 100, 40)]} />,
    );
    expect(getResult().suggestedFactor).toBeCloseTo(0.4, 5);
  });

  it("starts with applied=false before any writeback is applied", () => {
    renderToStaticMarkup(
      <Harness isLoaded={true} samples={[sample("a", 100, 150)]} />,
    );
    expect(getResult().writeback.applied).toBe(false);
    expect(getResult().writeback.factor).toBe(1);
  });

  it("exposes apply / applyFactor / reset callables", () => {
    renderToStaticMarkup(<Harness isLoaded={true} samples={[]} />);
    const result = getResult();
    expect(typeof result.applyWriteback).toBe("function");
    expect(typeof result.applyWritebackFactor).toBe("function");
    expect(typeof result.resetWriteback).toBe("function");
  });
});
