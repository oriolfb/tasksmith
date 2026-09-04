/** Gives a styled div/span the keyboard behaviour its `role="button"` promises. */
export function makeKeyboardButton(element: HTMLElement, activate: () => void): void {
  element.setAttribute("role", "button");
  element.tabIndex = 0;
  element.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    activate();
  });
}
