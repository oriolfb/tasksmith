import { makeKeyboardButton } from "../views/keyboard";

describe("makeKeyboardButton", () => {
  it.each(["Enter", " "])("activates a non-native button with %s", (key) => {
    const handlers = new Map<string, (event: KeyboardEvent) => void>();
    const el = {
      tabIndex: -1,
      setAttribute: jest.fn(),
      addEventListener: (type: string, handler: (event: KeyboardEvent) => void) => handlers.set(type, handler),
    };
    const activate = jest.fn();
    const preventDefault = jest.fn();

    makeKeyboardButton(el as never, activate);
    handlers.get("keydown")?.({ key, preventDefault, stopPropagation: jest.fn() } as never);

    expect(el.tabIndex).toBe(0);
    expect(preventDefault).toHaveBeenCalled();
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it("ignores unrelated keys", () => {
    let keydown: ((event: KeyboardEvent) => void) | undefined;
    const el = {
      tabIndex: -1,
      setAttribute: jest.fn(),
      addEventListener: (_type: string, handler: (event: KeyboardEvent) => void) => {
        keydown = handler;
      },
    };
    const activate = jest.fn();
    makeKeyboardButton(el as never, activate);
    keydown?.({ key: "Tab", preventDefault: jest.fn(), stopPropagation: jest.fn() } as never);
    expect(activate).not.toHaveBeenCalled();
  });
});
