/**
 * Stub for the `openai` package in the React Native bundle.
 *
 * The openai SDK targets Node.js and uses fetch/XMLHttpRequest shims that
 * don't exist in the Hermes/Metro environment. Since AppLens is initialised
 * with `ai: false` in this Example app, the OpenAIProvider is never
 * instantiated at runtime — this stub satisfies the import without pulling
 * in any Node.js-specific code.
 *
 * To enable AI features, swap this stub for the real package and configure
 * a React-Native-compatible fetch polyfill.
 */

class OpenAI {
  constructor() {}
  get chat() {
    return {
      completions: {
        create: async () => {
          throw new Error('OpenAI is not configured in this build.');
        },
      },
    };
  }
}

module.exports = OpenAI;
module.exports.default = OpenAI;
