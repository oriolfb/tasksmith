import { DebouncedAction } from "../utils/DebouncedAction";

describe("DebouncedAction", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("runs only the newest action after a burst", () => {
    const debounce = new DebouncedAction(250);
    const first = jest.fn();
    const latest = jest.fn();

    debounce.schedule(first);
    debounce.schedule(latest);
    jest.advanceTimersByTime(249);
    expect(latest).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });
});
