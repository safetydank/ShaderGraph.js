(function ($) {

/**
 * Building block for effects, wraps a shader node, guides compilation.
 */
$.Block = function (node) {
  node = node || new $.Node();
  this.node(node);

  this.children = [];
  this.parent = null;
  this.properties = {};
  this.index = ++$.Block.index;

  this.refresh();
};

$.Block.index = 0;

$.Block.prototype = {

  node: function (node) {
    if (node !== undefined) {
      this._node = node;
      return this;
    }
    return this._node;
  },

  refresh: function () {
    this._node.owner(this);
    this._node.outlets(this.outlets());
  },

  fetch: function (program, phase, outlet, priority) {
    // add outlet code to program
  },

};

/**
 * Building block for a GLSL shader
 */
$.Block.Snippet = function (code) {
  this.snippet = new $.Snippet(code);

  $.Block.call(this);
};

$.Block.Snippet.prototype = _.extend({}, $.Block.prototype, {

  insert: function (program, phase, priority) {
    // Compile code into program.
    $.Block.Snippet.compileCall(program, phase, this.node(), this.snippet, priority);
  },

  fetch: function (program, phase, outlet, priority) {
    // Ensure code is included in program.
    if (!program.include(this, phase)) {
      this.insert(program, phase, priority);
    }
    // Use this outlet's ID as intermediate variable name.
    return outlet.id();
  },

  outlets: function () {
    return $.Block.Snippet.makeOutlets(this.snippet.arguments());
  }//,

});

/**
 * Building block for a renderable material
 */
$.Block.Material = function (vertex, fragment) {
  this.vertex = new $.Snippet(vertex);
  this.fragment = new $.Snippet(fragment);

  $.Block.call(this);
};

$.Block.Material.prototype = _.extend({}, $.Block.prototype, {

  compile: function () {
    if (this.node().out.length > 0) throw "Can't compile material with outputs";

    var node = this.node();
    var program = new $.Program();

    this.insert(program, 'vertex', 0);
    this.insert(program, 'fragment', 0);

    program.compile();

    return program;
  },

  insert: function (program, phase, priority) {
    $.Block.Snippet.compileCall(program, phase, this.node(), this[phase], priority);
  },

  fetch: function (program, phase, outlet, priority) {
    // Ensure code is included in program.
    if (!program.include(this, phase)) {
      this.insert(program, phase, priority);
    }

    // Ensure vertex shader is added to program even if vertex outputs are not used.
    if (phase == 'fragment') {
      if (!program.include(this, 'vertex')) {
        this.insert(program, 'vertex', 0);
      }
    }

    // Use this outlet's ID as intermediate variable name.
    return outlet.id();
  },

  outlets: function () {
    var vertex   = $.Block.Snippet.makeOutlets(this.vertex.arguments());
    var fragment = $.Block.Snippet.makeOutlets(this.fragment.arguments());

    return _.union(vertex, fragment);
  }//,

});

/**
 * Make outlets based on a given signature.
 */
$.Block.Snippet.makeOutlets = function (args) {
  var outlets = [];

  _.each(args.parameters, function (arg) {
    arg.meta = { required: true };
    arg.hint = arg.name.replace(/(In|Out)$/, '');
    arg.category = 'parameter';
    outlets.push(arg);
  });

  _.each(args.uniforms, function (arg) {
    arg.meta = { };
    arg.hint = arg.name.replace(/(In|Out)$/, '');
    arg.category = 'uniform';
    arg.inout = $.IN;
    outlets.push(arg);
  });

  return outlets;
}

/**
 * Compile a GLSL snippet call.
 */
$.Block.Snippet.compileCall = function (program, phase, node, snippet, priority) {
  var signature = snippet.arguments();
  var args = [];

  // Assign intermediate variables.
  _.each(signature.parameters, function (arg) {
    var outlet = node.get(arg.name);
    if (arg.inout == $.IN) {
      if (outlet.in) {
        var owner = outlet.in.node.owner();

        var variable = owner.fetch(program, phase, outlet.in, priority + 1);
        program.variable(phase, variable, arg.type);
        args.push(variable);
      }
      else {
        throw ["Missing connection on outlet for " + arg.name, outlet.name];
      }
    }
    else if (arg.inout == $.OUT) {
      var variable = outlet.id();
      program.variable(phase, variable, arg.type);
      args.push(variable);
    }
  });

  // Add uniforms
  var replaced = [];
  _.each(signature.uniforms, function (arg) {
    var outlet = node.get(arg.name);

    // Replace uniform with argument
    if (outlet.in) {
      var owner = outlet.in.node.owner();

      var variable = owner.fetch(program, phase, outlet.in, priority + 1);
      program.variable(phase, variable, arg.type);
      args.push(variable);
      replaced.push(arg.name);
    }
    // Pass through uniform
    else {
      program.external('uniform', arg.name, arg.type, arg.value);
    }
  });

  // Add code and call to program.
  var name = ['__', phase, snippet.name, node.owner().index ].join('');
  program.add(phase, name, args, snippet.compile(name, replaced), priority);
};


})(ShaderGraph);