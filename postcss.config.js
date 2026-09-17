/**
 * FinAhead uses plain CSS and no PostCSS plugins.
 *
 * This file exists so PostCSS stops its config search here. Without it, the
 * search walks up past the project and can pick up an unrelated config from a
 * parent directory, which makes the build depend on what happens to be on the
 * machine.
 */
export default { plugins: {} }
