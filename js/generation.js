/**
 * MindForge generation service
 * The single frontend entry point for study generation. It validates the
 * request, delegates to a provider (the local mock by default), validates the
 * provider response against the runtime contract and resolves with the
 * sanitised study-material object.
 *
 * A future api.js can call MindForgeGeneration.setProvider(apiProvider) without
 * changing the workspace UI or moving provider logic into components.
 */
(function (global) {
  'use strict';

  var ERROR_CODES = {
    INVALID_REQUEST: 'invalid-request',
    INVALID_RESPONSE: 'invalid-response',
    GENERATION_FAILED: 'generation-failed',
    PROVIDER_UNAVAILABLE: 'provider-unavailable',
    CONTRACT_UNAVAILABLE: 'contract-unavailable'
  };

  function GenerationError(message, options) {
    var settings = options || {};

    this.name = 'GenerationError';
    this.message = message;
    this.code = settings.code || ERROR_CODES.GENERATION_FAILED;
    this.recoverable = Boolean(settings.recoverable);
    this.diagnostics = settings.diagnostics || {};

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GenerationError);
    }
  }

  GenerationError.prototype = Object.create(Error.prototype);
  GenerationError.prototype.constructor = GenerationError;

  var provider = null;
  var providerName = 'local-mock';

  function contract() {
    return global.MindForgeContract;
  }

  function safeCause(error) {
    return {
      name: error && error.name ? String(error.name) : 'Error'
    };
  }

  function localProvider(input) {
    var generator = global.MindForgeGenerator;

    if (!generator || typeof generator.generate !== 'function') {
      throw new GenerationError(
        'The local generator did not load. Refresh the page and try again.',
        {
          code: ERROR_CODES.PROVIDER_UNAVAILABLE,
          recoverable: false,
          diagnostics: { provider: 'local-mock' }
        }
      );
    }

    return generator.generate(input);
  }

  function getProvider() {
    return provider || localProvider;
  }

  function getProviderName() {
    return providerName;
  }

  function setProvider(nextProvider, name) {
    if (nextProvider !== null && typeof nextProvider !== 'function') {
      throw new TypeError('A generation provider must be a function or null.');
    }

    provider = nextProvider || null;
    providerName = provider
      ? typeof name === 'string' && name.trim()
        ? name.trim()
        : 'custom-provider'
      : 'local-mock';

    return providerName;
  }

  function resetProvider() {
    provider = null;
    providerName = 'local-mock';
    return providerName;
  }

  function wrapProviderError(error) {
    if (error instanceof GenerationError) {
      return error;
    }

    return new GenerationError(
      'Generation did not finish. Your notes are safe — check the details and try again.',
      {
        code: ERROR_CODES.GENERATION_FAILED,
        recoverable: true,
        diagnostics: {
          cause: safeCause(error)
        }
      }
    );
  }

  function generate(request) {
    var validationModule = contract();

    if (!validationModule) {
      return Promise.reject(
        new GenerationError(
          'The study contract did not load. Refresh the page and try again.',
          {
            code: ERROR_CODES.CONTRACT_UNAVAILABLE,
            recoverable: false
          }
        )
      );
    }

    var requestValidation = validationModule.validateRequest(request);

    if (!requestValidation.ok) {
      return Promise.reject(
        new GenerationError('Please fix the highlighted fields and try again.', {
          code: ERROR_CODES.INVALID_REQUEST,
          recoverable: false,
          diagnostics: requestValidation.diagnostics
        })
      );
    }

    var promise;

    try {
      promise = Promise.resolve(getProvider()(requestValidation.value));
    } catch (error) {
      return Promise.reject(wrapProviderError(error));
    }

    return promise.then(
      function (rawResult) {
        var responseValidation =
          validationModule.validateResponse(rawResult);

        if (!responseValidation.ok) {
          throw new GenerationError(
            'The generator returned study material that could not be used. Please try again.',
            {
              code: ERROR_CODES.INVALID_RESPONSE,
              recoverable: false,
              diagnostics: responseValidation.diagnostics
            }
          );
        }

        return responseValidation.value;
      },
      function (error) {
        throw wrapProviderError(error);
      }
    );
  }

  global.MindForgeGeneration = Object.freeze({
    ERROR_CODES: ERROR_CODES,
    GenerationError: GenerationError,
    generate: generate,
    getProviderName: getProviderName,
    setProvider: setProvider,
    resetProvider: resetProvider
  });
})(window);
