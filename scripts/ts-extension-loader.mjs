export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const bareSpecifier = specifier.split(/[?#]/)[0];
    const isRelativeOrAbsolute = bareSpecifier.startsWith(".") || bareSpecifier.startsWith("/");
    const hasExtension = /\.[cm]?[jt]sx?$/.test(bareSpecifier);

    if (isRelativeOrAbsolute && !hasExtension) {
      try {
        return await nextResolve(`${specifier}.ts`, context);
      } catch {
        try {
          return await nextResolve(`${specifier}.tsx`, context);
        } catch {
          // Fall through to the original resolution error.
        }
      }
    }

    throw error;
  }
}
