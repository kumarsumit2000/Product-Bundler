// Triggers a form submission by its DOM id. Used by Polaris `Page`
// `primaryAction` to provide a "Save" button in the page header that
// submits a form rendered elsewhere in the page (e.g. inside a form
// component lower in the React tree).
export function submitFormById(id: string): void {
  if (typeof document === "undefined") return;
  const form = document.getElementById(id) as HTMLFormElement | null;
  form?.requestSubmit();
}
