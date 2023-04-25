/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noflow
 * @nolint
 * @preventMunge
 * @preserve-invariant-messages
 */

'use strict';

if (__DEV__) {
  (function() {
"use strict";

var ReactFlightDOMRelayClientIntegration = require("ReactFlightDOMRelayClientIntegration");
var ReactDOM = require("react-dom");
var React = require("react");

var isArrayImpl = Array.isArray; // eslint-disable-next-line no-redeclare

function isArray(a) {
  return isArrayImpl(a);
}

function resolveClientReference(bundlerConfig, metadata) {
  return ReactFlightDOMRelayClientIntegration.resolveClientReference(metadata);
}

function parseModelRecursively(response, parentObj, key, value) {
  if (typeof value === "string") {
    return parseModelString(response, parentObj, key, value);
  }

  if (typeof value === "object" && value !== null) {
    if (isArray(value)) {
      var parsedValue = [];

      for (var i = 0; i < value.length; i++) {
        parsedValue[i] = parseModelRecursively(
          response,
          value,
          "" + i,
          value[i]
        );
      }

      return parseModelTuple(response, parsedValue);
    } else {
      var _parsedValue = {};

      for (var innerKey in value) {
        _parsedValue[innerKey] = parseModelRecursively(
          response,
          value,
          innerKey,
          value[innerKey]
        );
      }

      return _parsedValue;
    }
  }

  return value;
}

var dummy = {};
function parseModel(response, json) {
  return parseModelRecursively(response, dummy, "", json);
}

var ReactDOMSharedInternals =
  ReactDOM.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

// This client file is in the shared folder because it applies to both SSR and browser contexts.
var ReactDOMCurrentDispatcher = ReactDOMSharedInternals.Dispatcher;
function dispatchHint(code, model) {
  var dispatcher = ReactDOMCurrentDispatcher.current;

  if (dispatcher) {
    var href, options;

    if (typeof model === "string") {
      href = model;
    } else {
      href = model[0];
      options = model[1];
    }

    switch (code) {
      case "D": {
        // $FlowFixMe[prop-missing] options are not refined to their types by code
        dispatcher.prefetchDNS(href, options);
        return;
      }

      case "C": {
        // $FlowFixMe[prop-missing] options are not refined to their types by code
        dispatcher.preconnect(href, options);
        return;
      }

      case "L": {
        // $FlowFixMe[prop-missing] options are not refined to their types by code
        // $FlowFixMe[incompatible-call] options are not refined to their types by code
        dispatcher.preload(href, options);
        return;
      }

      case "I": {
        // $FlowFixMe[prop-missing] options are not refined to their types by code
        // $FlowFixMe[incompatible-call] options are not refined to their types by code
        dispatcher.preinit(href, options);
        return;
      }
    }
  }
}

var knownServerReferences = new WeakMap();

// ATTENTION
// When adding new symbols to this file,
// Please consider also adding to 'react-devtools-shared/src/backend/ReactSymbols'
// The Symbol used to tag the ReactElement-like types.
var REACT_ELEMENT_TYPE = Symbol.for("react.element");
var REACT_LAZY_TYPE = Symbol.for("react.lazy");
var REACT_SERVER_CONTEXT_DEFAULT_VALUE_NOT_LOADED = Symbol.for(
  "react.default_value"
);

var ReactSharedInternals =
  React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

var ContextRegistry = ReactSharedInternals.ContextRegistry;
function getOrCreateServerContext(globalName) {
  if (!ContextRegistry[globalName]) {
    ContextRegistry[globalName] = React.createServerContext(
      globalName, // $FlowFixMe[incompatible-call] function signature doesn't reflect the symbol value
      REACT_SERVER_CONTEXT_DEFAULT_VALUE_NOT_LOADED
    );
  }

  return ContextRegistry[globalName];
}

var PENDING = "pending";
var BLOCKED = "blocked";
var RESOLVED_MODEL = "resolved_model";
var RESOLVED_MODULE = "resolved_module";
var INITIALIZED = "fulfilled";
var ERRORED = "rejected"; // $FlowFixMe[missing-this-annot]

function Chunk(status, value, reason, response) {
  this.status = status;
  this.value = value;
  this.reason = reason;
  this._response = response;
} // We subclass Promise.prototype so that we get other methods like .catch

Chunk.prototype = Object.create(Promise.prototype); // TODO: This doesn't return a new Promise chain unlike the real .then

Chunk.prototype.then = function (resolve, reject) {
  var chunk = this; // If we have resolved content, we try to initialize it first which
  // might put us back into one of the other states.

  switch (chunk.status) {
    case RESOLVED_MODEL:
      initializeModelChunk(chunk);
      break;

    case RESOLVED_MODULE:
      initializeModuleChunk(chunk);
      break;
  } // The status might have changed after initialization.

  switch (chunk.status) {
    case INITIALIZED:
      resolve(chunk.value);
      break;

    case PENDING:
    case BLOCKED:
      if (resolve) {
        if (chunk.value === null) {
          chunk.value = [];
        }

        chunk.value.push(resolve);
      }

      if (reject) {
        if (chunk.reason === null) {
          chunk.reason = [];
        }

        chunk.reason.push(reject);
      }

      break;

    default:
      reject(chunk.reason);
      break;
  }
};

function readChunk(chunk) {
  // If we have resolved content, we try to initialize it first which
  // might put us back into one of the other states.
  switch (chunk.status) {
    case RESOLVED_MODEL:
      initializeModelChunk(chunk);
      break;

    case RESOLVED_MODULE:
      initializeModuleChunk(chunk);
      break;
  } // The status might have changed after initialization.

  switch (chunk.status) {
    case INITIALIZED:
      return chunk.value;

    case PENDING:
    case BLOCKED:
      // eslint-disable-next-line no-throw-literal
      throw chunk;

    default:
      throw chunk.reason;
  }
}

function getRoot(response) {
  var chunk = getChunk(response, 0);
  return chunk;
}

function createPendingChunk(response) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new Chunk(PENDING, null, null, response);
}

function createBlockedChunk(response) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new Chunk(BLOCKED, null, null, response);
}

function createErrorChunk(response, error) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new Chunk(ERRORED, null, error, response);
}

function wakeChunk(listeners, value) {
  for (var i = 0; i < listeners.length; i++) {
    var listener = listeners[i];
    listener(value);
  }
}

function wakeChunkIfInitialized(chunk, resolveListeners, rejectListeners) {
  switch (chunk.status) {
    case INITIALIZED:
      wakeChunk(resolveListeners, chunk.value);
      break;

    case PENDING:
    case BLOCKED:
      chunk.value = resolveListeners;
      chunk.reason = rejectListeners;
      break;

    case ERRORED:
      if (rejectListeners) {
        wakeChunk(rejectListeners, chunk.reason);
      }

      break;
  }
}

function triggerErrorOnChunk(chunk, error) {
  if (chunk.status !== PENDING && chunk.status !== BLOCKED) {
    // We already resolved. We didn't expect to see this.
    return;
  }

  var listeners = chunk.reason;
  var erroredChunk = chunk;
  erroredChunk.status = ERRORED;
  erroredChunk.reason = error;

  if (listeners !== null) {
    wakeChunk(listeners, error);
  }
}

function createResolvedModelChunk(response, value) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new Chunk(RESOLVED_MODEL, value, null, response);
}

function createResolvedModuleChunk(response, value) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new Chunk(RESOLVED_MODULE, value, null, response);
}

function resolveModelChunk(chunk, value) {
  if (chunk.status !== PENDING) {
    // We already resolved. We didn't expect to see this.
    return;
  }

  var resolveListeners = chunk.value;
  var rejectListeners = chunk.reason;
  var resolvedChunk = chunk;
  resolvedChunk.status = RESOLVED_MODEL;
  resolvedChunk.value = value;

  if (resolveListeners !== null) {
    // This is unfortunate that we're reading this eagerly if
    // we already have listeners attached since they might no
    // longer be rendered or might not be the highest pri.
    initializeModelChunk(resolvedChunk); // The status might have changed after initialization.

    wakeChunkIfInitialized(chunk, resolveListeners, rejectListeners);
  }
}

function resolveModuleChunk(chunk, value) {
  if (chunk.status !== PENDING && chunk.status !== BLOCKED) {
    // We already resolved. We didn't expect to see this.
    return;
  }

  var resolveListeners = chunk.value;
  var rejectListeners = chunk.reason;
  var resolvedChunk = chunk;
  resolvedChunk.status = RESOLVED_MODULE;
  resolvedChunk.value = value;

  if (resolveListeners !== null) {
    initializeModuleChunk(resolvedChunk);
    wakeChunkIfInitialized(chunk, resolveListeners, rejectListeners);
  }
}

var initializingChunk = null;
var initializingChunkBlockedModel = null;

function initializeModelChunk(chunk) {
  var prevChunk = initializingChunk;
  var prevBlocked = initializingChunkBlockedModel;
  initializingChunk = chunk;
  initializingChunkBlockedModel = null;

  try {
    var value = parseModel(chunk._response, chunk.value);

    if (
      initializingChunkBlockedModel !== null &&
      initializingChunkBlockedModel.deps > 0
    ) {
      initializingChunkBlockedModel.value = value; // We discovered new dependencies on modules that are not yet resolved.
      // We have to go the BLOCKED state until they're resolved.

      var blockedChunk = chunk;
      blockedChunk.status = BLOCKED;
      blockedChunk.value = null;
      blockedChunk.reason = null;
    } else {
      var initializedChunk = chunk;
      initializedChunk.status = INITIALIZED;
      initializedChunk.value = value;
    }
  } catch (error) {
    var erroredChunk = chunk;
    erroredChunk.status = ERRORED;
    erroredChunk.reason = error;
  } finally {
    initializingChunk = prevChunk;
    initializingChunkBlockedModel = prevBlocked;
  }
}

function initializeModuleChunk(chunk) {
  try {
    var value = ReactFlightDOMRelayClientIntegration.requireModule(chunk.value);
    var initializedChunk = chunk;
    initializedChunk.status = INITIALIZED;
    initializedChunk.value = value;
  } catch (error) {
    var erroredChunk = chunk;
    erroredChunk.status = ERRORED;
    erroredChunk.reason = error;
  }
} // Report that any missing chunks in the model is now going to throw this
// error upon read. Also notify any pending promises.

function reportGlobalError(response, error) {
  response._chunks.forEach(function (chunk) {
    // If this chunk was already resolved or errored, it won't
    // trigger an error but if it wasn't then we need to
    // because we won't be getting any new data to resolve it.
    if (chunk.status === PENDING) {
      triggerErrorOnChunk(chunk, error);
    }
  });
}

function createElement(type, key, props) {
  var element = {
    // This tag allows us to uniquely identify this as a React Element
    $$typeof: REACT_ELEMENT_TYPE,
    // Built-in properties that belong on the element
    type: type,
    key: key,
    ref: null,
    props: props,
    // Record the component responsible for creating this element.
    _owner: null
  };

  {
    // We don't really need to add any of these but keeping them for good measure.
    // Unfortunately, _store is enumerable in jest matchers so for equality to
    // work, I need to keep it or make _store non-enumerable in the other file.
    element._store = {};
    Object.defineProperty(element._store, "validated", {
      configurable: false,
      enumerable: false,
      writable: true,
      value: true // This element has already been validated on the server.
    });
    Object.defineProperty(element, "_self", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: null
    });
    Object.defineProperty(element, "_source", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: null
    });
  }

  return element;
}

function createLazyChunkWrapper(chunk) {
  var lazyType = {
    $$typeof: REACT_LAZY_TYPE,
    _payload: chunk,
    _init: readChunk
  };
  return lazyType;
}

function getChunk(response, id) {
  var chunks = response._chunks;
  var chunk = chunks.get(id);

  if (!chunk) {
    chunk = createPendingChunk(response);
    chunks.set(id, chunk);
  }

  return chunk;
}

function createModelResolver(chunk, parentObject, key) {
  var blocked;

  if (initializingChunkBlockedModel) {
    blocked = initializingChunkBlockedModel;
    blocked.deps++;
  } else {
    blocked = initializingChunkBlockedModel = {
      deps: 1,
      value: null
    };
  }

  return function (value) {
    parentObject[key] = value;
    blocked.deps--;

    if (blocked.deps === 0) {
      if (chunk.status !== BLOCKED) {
        return;
      }

      var resolveListeners = chunk.value;
      var initializedChunk = chunk;
      initializedChunk.status = INITIALIZED;
      initializedChunk.value = blocked.value;

      if (resolveListeners !== null) {
        wakeChunk(resolveListeners, blocked.value);
      }
    }
  };
}

function createModelReject(chunk) {
  return function (error) {
    return triggerErrorOnChunk(chunk, error);
  };
}

function createServerReferenceProxy(response, metaData) {
  var callServer = response._callServer;

  var proxy = function () {
    // $FlowFixMe[method-unbinding]
    var args = Array.prototype.slice.call(arguments);
    var p = metaData.bound;

    if (!p) {
      return callServer(metaData.id, args);
    }

    if (p.status === INITIALIZED) {
      var bound = p.value;
      return callServer(metaData.id, bound.concat(args));
    } // Since this is a fake Promise whose .then doesn't chain, we have to wrap it.
    // TODO: Remove the wrapper once that's fixed.

    return Promise.resolve(p).then(function (bound) {
      return callServer(metaData.id, bound.concat(args));
    });
  };

  knownServerReferences.set(proxy, metaData);
  return proxy;
}

function parseModelString(response, parentObject, key, value) {
  if (value[0] === "$") {
    if (value === "$") {
      // A very common symbol.
      return REACT_ELEMENT_TYPE;
    }

    switch (value[1]) {
      case "$": {
        // This was an escaped string value.
        return value.slice(1);
      }

      case "L": {
        // Lazy node
        var id = parseInt(value.slice(2), 16);
        var chunk = getChunk(response, id); // We create a React.lazy wrapper around any lazy values.
        // When passed into React, we'll know how to suspend on this.

        return createLazyChunkWrapper(chunk);
      }

      case "@": {
        // Promise
        var _id = parseInt(value.slice(2), 16);

        var _chunk = getChunk(response, _id);

        return _chunk;
      }

      case "S": {
        // Symbol
        return Symbol.for(value.slice(2));
      }

      case "P": {
        // Server Context Provider
        return getOrCreateServerContext(value.slice(2)).Provider;
      }

      case "F": {
        // Server Reference
        var _id2 = parseInt(value.slice(2), 16);

        var _chunk2 = getChunk(response, _id2);

        switch (_chunk2.status) {
          case RESOLVED_MODEL:
            initializeModelChunk(_chunk2);
            break;
        } // The status might have changed after initialization.

        switch (_chunk2.status) {
          case INITIALIZED: {
            var metadata = _chunk2.value;
            return createServerReferenceProxy(response, metadata);
          }
          // We always encode it first in the stream so it won't be pending.

          default:
            throw _chunk2.reason;
        }
      }

      case "I": {
        // $Infinity
        return Infinity;
      }

      case "-": {
        // $-0 or $-Infinity
        if (value === "$-0") {
          return -0;
        } else {
          return -Infinity;
        }
      }

      case "N": {
        // $NaN
        return NaN;
      }

      case "u": {
        // matches "$undefined"
        // Special encoding for `undefined` which can't be serialized as JSON otherwise.
        return undefined;
      }

      case "D": {
        // Date
        return new Date(Date.parse(value.slice(2)));
      }

      case "n": {
        // BigInt
        return BigInt(value.slice(2));
      }

      default: {
        // We assume that anything else is a reference ID.
        var _id3 = parseInt(value.slice(1), 16);

        var _chunk3 = getChunk(response, _id3);

        switch (_chunk3.status) {
          case RESOLVED_MODEL:
            initializeModelChunk(_chunk3);
            break;

          case RESOLVED_MODULE:
            initializeModuleChunk(_chunk3);
            break;
        } // The status might have changed after initialization.

        switch (_chunk3.status) {
          case INITIALIZED:
            return _chunk3.value;

          case PENDING:
          case BLOCKED:
            var parentChunk = initializingChunk;

            _chunk3.then(
              createModelResolver(parentChunk, parentObject, key),
              createModelReject(parentChunk)
            );

            return null;

          default:
            throw _chunk3.reason;
        }
      }
    }
  }

  return value;
}
function parseModelTuple(response, value) {
  var tuple = value;

  if (tuple[0] === REACT_ELEMENT_TYPE) {
    // TODO: Consider having React just directly accept these arrays as elements.
    // Or even change the ReactElement type to be an array.
    return createElement(tuple[1], tuple[2], tuple[3]);
  }

  return value;
}

function missingCall() {
  throw new Error(
    'Trying to call a function from "use server" but the callServer option ' +
      "was not implemented in your router runtime."
  );
}

function createResponse(bundlerConfig, callServer) {
  var chunks = new Map();
  var response = {
    _bundlerConfig: bundlerConfig,
    _callServer: callServer !== undefined ? callServer : missingCall,
    _chunks: chunks
  };
  return response;
}
function resolveModel(response, id, model) {
  var chunks = response._chunks;
  var chunk = chunks.get(id);

  if (!chunk) {
    chunks.set(id, createResolvedModelChunk(response, model));
  } else {
    resolveModelChunk(chunk, model);
  }
}
function resolveModule(response, id, model) {
  var chunks = response._chunks;
  var chunk = chunks.get(id);
  var clientReferenceMetadata = parseModel(response, model);
  var clientReference = resolveClientReference(
    response._bundlerConfig,
    clientReferenceMetadata
  ); // TODO: Add an option to encode modules that are lazy loaded.
  // For now we preload all modules as early as possible since it's likely
  // that we'll need them.

  var promise =
    ReactFlightDOMRelayClientIntegration.preloadModule(clientReference);

  if (promise) {
    var blockedChunk;

    if (!chunk) {
      // Technically, we should just treat promise as the chunk in this
      // case. Because it'll just behave as any other promise.
      blockedChunk = createBlockedChunk(response);
      chunks.set(id, blockedChunk);
    } else {
      // This can't actually happen because we don't have any forward
      // references to modules.
      blockedChunk = chunk;
      blockedChunk.status = BLOCKED;
    }

    promise.then(
      function () {
        return resolveModuleChunk(blockedChunk, clientReference);
      },
      function (error) {
        return triggerErrorOnChunk(blockedChunk, error);
      }
    );
  } else {
    if (!chunk) {
      chunks.set(id, createResolvedModuleChunk(response, clientReference));
    } else {
      // This can't actually happen because we don't have any forward
      // references to modules.
      resolveModuleChunk(chunk, clientReference);
    }
  }
}
function resolveErrorDev(response, id, digest, message, stack) {
  var error = new Error(
    message ||
      "An error occurred in the Server Components render but no message was provided"
  );
  error.stack = stack;
  error.digest = digest;
  var errorWithDigest = error;
  var chunks = response._chunks;
  var chunk = chunks.get(id);

  if (!chunk) {
    chunks.set(id, createErrorChunk(response, errorWithDigest));
  } else {
    triggerErrorOnChunk(chunk, errorWithDigest);
  }
}
function resolveHint(response, code, model) {
  var hintModel = parseModel(response, model);
  dispatchHint(code, hintModel);
}
function close(response) {
  // In case there are any remaining unresolved chunks, they won't
  // be resolved now. So we need to issue an error to those.
  // Ideally we should be able to early bail out if we kept a
  // ref count of pending chunks.
  reportGlobalError(response, new Error("Connection closed."));
}

function resolveRow(response, chunk) {
  if (chunk[0] === "O") {
    // $FlowFixMe[incompatible-call] unable to refine on array indices
    resolveModel(response, chunk[1], chunk[2]);
  } else if (chunk[0] === "I") {
    // $FlowFixMe[incompatible-call] unable to refine on array indices
    resolveModule(response, chunk[1], chunk[2]);
  } else if (chunk[0] === "H") {
    // $FlowFixMe[incompatible-call] unable to refine on array indices
    resolveHint(response, chunk[1], chunk[2]);
  } else {
    {
      resolveErrorDev(
        response, // $FlowFixMe[incompatible-call]: Flow doesn't support disjoint unions on tuples.
        chunk[1], // $FlowFixMe[incompatible-call]: Flow doesn't support disjoint unions on tuples.
        // $FlowFixMe[prop-missing]
        // $FlowFixMe[incompatible-use]
        chunk[2].digest, // $FlowFixMe[incompatible-call]: Flow doesn't support disjoint unions on tuples.
        // $FlowFixMe[incompatible-use]
        chunk[2].message || "", // $FlowFixMe[incompatible-call]: Flow doesn't support disjoint unions on tuples.
        // $FlowFixMe[incompatible-use]
        chunk[2].stack || ""
      );
    }
  }
}

exports.close = close;
exports.createResponse = createResponse;
exports.getRoot = getRoot;
exports.resolveRow = resolveRow;

  })();
}
