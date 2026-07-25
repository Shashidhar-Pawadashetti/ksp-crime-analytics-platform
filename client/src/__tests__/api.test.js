import { ApiError, queryPipeline } from '../services/api';

describe('ApiError', () => {
  test('extends Error with errorCode and fallbackAnswer', () => {
    const err = new ApiError('PIPELINE_ERROR', 'Server error', 'Try again');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ApiError');
    expect(err.errorCode).toBe('PIPELINE_ERROR');
    expect(err.message).toBe('Server error');
    expect(err.fallbackAnswer).toBe('Try again');
  });

  test('without fallback — fallbackAnswer is null', () => {
    const err = new ApiError('HTTP_ERROR', 'Not found');
    expect(err.fallbackAnswer).toBeNull();
  });

  test('with empty string fallback — fallbackAnswer is null', () => {
    const err = new ApiError('HTTP_ERROR', 'Not found', '');
    expect(err.fallbackAnswer).toBeNull();
  });

  test('is throwable and caught as Error', () => {
    const fn = () => {
      throw new ApiError('AUTH_FAILED', 'Auth failed');
    };
    expect(fn).toThrow(Error);
    expect(fn).toThrow('Auth failed');
  });
});

describe('queryPipeline', () => {
  test('queryPipeline is a function', () => {
    expect(typeof queryPipeline).toBe('function');
  });
});
