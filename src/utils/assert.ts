/**
 * asserts a condition only in not production mode
 * @param condition The condition to check
 * @param msg The error message
 */
export function assert(condition: boolean, msg?: string): asserts condition {
  if (process.env.NODE_ENV === 'production') {
    if (!condition) {
      // TODO: Change with default logger
      console.warn(msg);
    }
    return;
  }
  if (!condition) {
    throw new AssertionError(msg || 'Assertion failed');
  }
}

class AssertionError extends Error {}
