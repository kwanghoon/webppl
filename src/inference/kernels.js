'use strict';

var assert = require('assert');
var _ = require('lodash');
var util = require('../util');

module.exports = function(env) {

  var MHKernel = require('./mhkernel')(env);
  var HMCKernel = require('./hmckernel')(env);

  function HMCwithMHKernel(options) {
    var hmc = HMCKernel(options);
    var mh = MHKernel({discreteOnly: true, adRequired: true});
    var f = function(cont, oldTrace, runOpts) {
      return hmc(function(trace) {
        return mh(cont, trace, runOpts);
      }, oldTrace, runOpts);
    };
    f.adRequired = true;
    return f;
  }

  var kernels = {
    MH: MHKernel,
    HMC: HMCwithMHKernel,
    HMConly: HMCKernel
  };

  // Takes an options object (as passed to inference algorithms) and
  // converts kernel options into functions with options partially
  // applied. For example:

  // 'MH' => function(..., opts) { return MHKernel(..., opts); }
  // { MH: options } => function(..., extraOpts) { return MHKernel(..., merge(options, extraOpts)) }

  function parseOptions(obj) {
    // Expects either a kernel name or an object containing a single
    // key/value pair where the key is a kernel name and the value is
    // an options object. e.g. 'MH' or { MH: { ... } }

    function isKernelOption(obj) {
      return _.isString(obj) && _.has(kernels, obj) ||
          _.size(obj) === 1 && _.has(kernels, _.keys(obj)[0]);
    }

    if (!isKernelOption(obj)) {
      throw new Error('Unrecognized kernel option: ' + JSON.stringify(obj));
    }

    var name = _.isString(obj) ? obj : _.keys(obj)[0];
    var options = _.isString(obj) ? {} : _.values(obj)[0];
    var kernel = kernels[name](options);

    return _.assign(function(cont, oldTrace, runOpts) {
      return kernel(cont, oldTrace, runOpts);
    }, kernel);
  }

  // Combinators for kernel functions.

  function tap(fn) {
    return function(k, trace) {
      fn(trace);
      return k(trace);
    };
  }

  function sequence() {
    var kernels = arguments;
    assert(kernels.length > 1);
    if (kernels.length === 2) {
      return function(k, trace1) {
        return kernels[0](function(trace2) {
          return kernels[1](k, trace2);
        }, trace1);
      };
    } else {
      return sequence(
          kernels[0],
          sequence.apply(null, _.rest(kernels)));
    }
  }

  function repeat(n, kernel) {
    return function(k, trace) {
      return util.cpsIterate(n, trace, kernel, k);
    };
  }

  return {
    parseOptions: parseOptions,
    tap: tap,
    sequence: sequence,
    repeat: repeat
  };

};
