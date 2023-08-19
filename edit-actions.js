/*******************************
 * File:        edit-actions.js
 * Author:      Mikaël Mayer
 * Around date: July 2020
 *******************************/

var editActions = {};

(function(editActions) {
  editActions.__syntacticSugar = true;
  editActions.__syntacticSugarReplace = true;
  editActions.choose = editActions.choose ? editActions.choose : Symbol("choose"); // For evaluation purposes.
  editActions.toPHPString = false;
  
  var Type = {
     Up: "Up",       // Navigate the tree
     Down: "Down",
     New: "New",     // Create a new tree
     Concat: "Concat", // Concatenates two instances of monoids.
     Custom: "Custom",
     UseResult: "UseResult", // Not supported for andThen, backPropagation and merge.
     Choose: "Choose", // Alternative choice options;
     Clone: "Clone" // Ensures we clone the previously reused structure, not the view.
  };
  function isObject(v) {
    return typeof v == "object";
  }
  function isEditAction(obj) {
    return isObject(obj) && obj.ctor in Type;
  }
  var PathElemType = {
    Offset: "Offset"
  }
  editActions.Type = Type;
  
  // Debugs the value of x, possibly with a nice message.
  // Return x;
  function debug(x, msg) {
    if(typeof x == "string" && typeof msg != "string") {
      return debug(msg, x);
    }
    if(msg) console.log(msg, stringOf(x));
    else console.log(stringOf(x));
    return x;
  }
  editActions.debug = debug;
  
  var cons = function(x, y) { 
    return {hd: x, tl: y} }
  var List = {
    cons: cons,
    reverse: function reverse(x, acc) {
      if(typeof x === "undefined") return acc;
      return reverse(x.tl, cons(x.hd, acc));
    },
    append: function append(x, y) {
      if(typeof y == "undefined") return x;
      if(typeof x == "undefined") return y;
      return cons(x.hd, append(x.tl, y));
    },
    length: function length(x) {
      if(typeof x === "undefined") return 0;
      return 1 + length(x.tl);
    },
    drop: function drop(n, x) {
      if(n <= 0 || typeof x === "undefined") return x;
      return drop(n - 1, x.tl);
    },
    fromArray: function(x) {
      let result = undefined;
      for(let i = x.length - 1; i >= 0; i--) {
        result = cons(x[i], result);
      }
      return result;
    },
    toArray: function(x) {
      let result = [];
      while(x) {
        result.push(x.hd); x = x.tl;
      }
      return result;
    },
    map: function map(f, x) {
      if(typeof x === "undefined") return undefined;
      return cons(f(x.hd), map(f, x.tl));
    },
    join: function(sep, x) {
      if(typeof x === "undefined") return "";
      result = x.hd;
      tl = x.tl;
      while(tl) { result += sep + tl.hd; tl = tl.tl}
      return result;
    },
    last: function(x) {
      if(typeof x !== "object") return x;
      while(x.tl) x = x.tl;
      return x.hd;
    }
  }
  editActions.List = List;
  Collection = {
    // Foreach that also adapts to non-collection items.
    foreach: function collectionForEach(c, callback, reduce) {
      if(!(Symbol.iterator in c)) {
        return callback(c);
      }
      const it = c[Symbol.iterator]();
      let result = undefined;
      let index = 0;
      for(let elem of it) {
        let tmp = callback(elem, index);
        if(reduce) result = reduce(result, tmp);
        else result = tmp;
        index++;
      }
      return result;
    },
    isEmpty: function isCollectionEmpty(c) {
      const it = c[Symbol.iterator]();
      for(let elem of it) {
        return false;
      }
      return true;
    },
    is: function isCollection(c) {
      return typeof c == "object" && Symbol.iterator in c;
    },
    onlyElemOrDefault: function onlyElemOfCollectionOrDefault(c, defaultValue) {
      if(!c || !(Symbol.iterator in c)) return c;
      const it = c[Symbol.iterator]();
      let result = undefined;
      let found = false;
      for(let elem of it) {
        if(!found) {
          result = elem;
          found = true;
          continue;
        }
        return defaultValue;
      }
      return found ? result : defaultValue;
    },
    firstOrDefault: function firstOrDefault(c, defaultValue) {
      const it = c[Symbol.iterator]();
      for(let elem of it) {
        return elem;
      }
      return defaultValue;
    },
    firstOrDefaultCallback: function firstOrDefaultCallback(c, defaultValue, callback) {
      return callback(Collection.firstOrDefault(c, defaultValue));
    },
    from: function collectionFrom() {
      let args = arguments;
      return {
        *[Symbol.iterator]() {
          for(let arg of args) {
            yield arg;
          }}}
    },
    map: function(c, callback) {
      return {
        *[Symbol.iterator]() {
          for(let arg of c) {
            yield callback(arg);
          }
        }
      }
    },
    filter: function(c, callback) {
      return {
        *[Symbol.iterator]() {
          for(let arg of c) {
            if(callback(arg)) {
              yield arg;
            }
          }
        }
      }
    },
    // Forgiving flatMap
    flatMap: function(c, callback) {
      return {
        *[Symbol.iterator]() {
          for(let arg of c) {
            let c2 = callback(arg);
            if(Collection.is(c2)) {
              for(let x of c2) {
                yield x;
              }
            } else {
              yield c2;
            }
          }
        }
      }
    }
  }
  editActions.Collection = Collection;
  
  /**
    Types of New:
    model is either
      {ctor: "Reuse"}
      {ctor: "Insert", value: value}
    // values has no keys for objects and arrays, except if values have keys, then these keys mark the intent to reuse the original value.
  */
  var TypeNewModel = {
    Extend: "Extend",
    Constant: "Constant"
  }
  // Create means that, during back-propagation, we keep the changes of the interpreter edit action (by default). Else, we just replace an interpreter's Reuse by Reuse();
  function ExtendModel(create = false) {
    return {ctor: TypeNewModel.Extend, create};
  }
  editActions.ExtendModel = ExtendModel;
  function ConstModel(value) {
    if(arguments.length == 0) value = {};
    return {ctor: TypeNewModel.Constant, value};
  }
  editActions.ConstModel = ConstModel;
  
  /* apply(New(1), x) = 1                 */
  /* apply(New({0: New(2)}, []), x) = [2] */
  /* apply(New([Reuse()]), x) = [x]       */
  function New(childEditActions, model) {
    if(arguments.length == 0) {
      return New({}, ConstModel(undefined));
    }
    if(arguments.length == 1) {
      if(typeof childEditActions == "object") {
        return New(childEditActions, ConstModel(Array.isArray(childEditActions) ? [] : {}));
      } else {
        return New({}, ConstModel(childEditActions));
      }
    }
    if(isObject(model) && !(model.ctor in TypeNewModel)) {
      model = ConstModel(model);
    }
    return {ctor: Type.New, childEditActions: childEditActions, model: model};
  }
  editActions.New = New;

  // Offset changes the current start position by +count on Down, -count on Up
  // Changes the length of the current slice to newLength on Down, on oldLength on Up
  function Offset(count, newLength, oldLength) {
    return {ctor: PathElemType.Offset, count: count, newLength: newLength, oldLength: oldLength};
  } 
  editActions.Offset = Offset;
    
  function isOffset(k) {
    return typeof k === "object" && k.ctor == PathElemType.Offset;
  }
  editActions.isOffset = isOffset;
  function isOffsetIdentity(offset) {
    return offset.count == 0 && offset.oldLength === offset.newLength;
  }
  function isKey(k) {
    return !isOffset(k);
  }
  
  function isPathElement(elem) {
    return typeof elem == "string" || typeof elem == "number" || isOffset(elem);
  }
  
  function UpLike(ifTwoArgsLastIsNotNecessaryEdit = true) {
    return function Up(keyOrOffset, subAction) {
      if(arguments.length == 1) subAction = Reuse();
      let subActionIsPureEdit = isEditAction(subAction);
      if(ifTwoArgsLastIsNotNecessaryEdit) {
        if(arguments.length > 2 || arguments.length == 2 && !subActionIsPureEdit && isPathElement(subAction)) {
          return Up(arguments[0], Up(...[...arguments].slice(1)));
        }
      } else {
        if(arguments.length > 2) {
          return Up(arguments[0], Up(...[...arguments].slice(1)));
        }
      }
      let ik = isOffset(keyOrOffset);
      if(ik && isOffsetIdentity(keyOrOffset)) return subAction;
      if(subActionIsPureEdit) {
        if(subAction.ctor == Type.Up) {
          let isk = isOffset(subAction.keyOrOffset);
          if(ik && isk) {
            let newOffset = upUpOffset(keyOrOffset, subAction.keyOrOffset);
            let newDownOffset = upToDownOffset(newOffset);
            if(newDownOffset !== undefined) {
              return Down(newDownOffset, subAction.subAction);
            } else {
              return Up(newOffset, subAction.subAction);
            }
          } 
        } else if(subAction.ctor == Type.Down && !subAction.isRemove) {
          let isk = isOffset(subAction.keyOrOffset);
          if(!ik && !isk) {
            if(keyOrOffset == subAction.keyOrOffset) {
              return subAction.subAction;
            }
          } else if(ik && isk) {
            let newOffset = upDownOffsetReturnsUp(keyOrOffset, subAction.keyOrOffset);
            if(isOffsetIdentity(newOffset)) return subAction.subAction;
            let newDownOffset = upToDownOffset(newOffset);
            if(newDownOffset !== undefined) {
              return Down(newDownOffset, subAction.subAction);
            }
            return Up(newOffset, subAction.subAction);
          }
        } else { // subAction is not a Down, Up, New
          if(ik) {
            let possibleDown = upToDownOffset( keyOrOffset);
            if(possibleDown !== undefined) {
              return Down(possibleDown, subAction.subAction);
            }
          }
        }
      }
      return {ctor: Type.Up, keyOrOffset: keyOrOffset, subAction: subAction};
    }
  }
  var Up = UpLike(false);
  var ForgivingUp = UpLike(true);
  editActions.Up = ForgivingUp;
  editActions.Up.pure = Up;
  
  function DownLike(isRemove, ifTwoArgsLastIsNotNecessaryEdit = true) {
    return function Down(keyOrOffset, subAction) {
      let ik = isOffset(keyOrOffset);
      if(isRemove && !ik) {
        console.trace("/!\\ warning, use of RemoveExcept on non-offset");
      }
      if(arguments.length == 1) subAction = Reuse();
      //printDebug("Down", isRemove, arguments);
      let subActionIsPureEdit = isEditAction(subAction);
      if(ifTwoArgsLastIsNotNecessaryEdit) {
        if(arguments.length > 2 || arguments.length == 2 && !subActionIsPureEdit && isPathElement(subAction)) {
          return Down(arguments[0], Down(...[...arguments].slice(1)));
        }
      } else {
        if(arguments.length > 2) {
          return Down(arguments[0], Down(...[...arguments].slice(1)));
        }
      }
      if(ik && isOffsetIdentity(keyOrOffset)) return subAction;
      if(subActionIsPureEdit) {
        if(subAction.ctor == Type.Down && (!isRemove && !subAction.isRemove || isRemove && subAction.isRemove)) {
          let isk = isOffset(subAction.keyOrOffset);
          if(ik && isk) {
            let newOffset = downDownOffset(keyOrOffset, subAction.keyOrOffset);
            return Down(newOffset, subAction.subAction);
          }
        } else if(subAction.ctor == Type.Up && !isRemove) {
          let isk = isOffset(subAction.keyOrOffset);
          if(ik && isk) {
            let newOffset = downUpOffsetReturnsUp(keyOrOffset, subAction.keyOrOffset);
            if(isOffsetIdentity(newOffset)) return subAction.subAction;
            let newDownOffset = upToDownOffset(newOffset);
            if(newDownOffset !== undefined) {
              return Down(newDownOffset, subAction.subAction);
            }
            return Up(newOffset, subAction.subAction);
          } else if(!ik && !isk) {
            if(keyOrOffset == subAction.keyOrOffset) {
              return subAction.subAction;
            } else {
              console.trace("/!\\ Warning, composing down ", keyOrOffset, " and up", subAction.keyOrOffset, ", so something is wrong");
            }
          }
        } else {
          if(ik && (keyOrOffset.count < 0 || !LessThanEqualUndefined(PlusUndefined(keyOrOffset.count, keyOrOffset.newLength), keyOrOffset.oldLength))) {
            // Flip to up.
            let newUpOffset = downToUpOffset(keyOrOffset);
            /*console.trace("/!\\ Warning, Down() was given an incorrect offset. Converting it to up. "+keyOrOffsetToString(keyOrOffset)+"=>"+keyOrOffsetToString(newUpOffset));*/
            return Up(newUpOffset, subAction);
          }
        }
      }
      return {ctor: Type.Down, keyOrOffset: keyOrOffset, subAction: subAction, isRemove: isRemove ? true : false};
    }
  }
  var Down = DownLike(false, false);
  var ForgivingDown = DownLike(false);
  var RemoveExcept = DownLike(true);
  editActions.Down = ForgivingDown;
  editActions.RemoveExcept = RemoveExcept;
  editActions.Down.pure = Down;

  function SameDownAs(editActionOrIsRemove) {
    if(typeof editActionOrIsRemove == "object" && editActionOrIsRemove.ctor == Type.Down) {
      return editActionOrIsRemove.isRemove ? RemoveExcept : Down;
    }
    return editActionOrIsRemove ? RemoveExcept : Down;
  }
  editActions.SameDownAs = SameDownAs;
  
  function optimizeConcatNew(first, second, firstWasRaw, secondWasRaw) {
    if(!isEditAction(first)) {
      first = New(first);
      firstWasRaw = true;
    }
    if(!isEditAction(second)) {
      second = New(second);
      secondWasRaw = true;
    }
    let bothWereNonEditActions = typeof firstWasRaw == "boolean" && typeof secondWasRaw == "boolean" && firstWasRaw && secondWasRaw;
    if(typeof first.model.value == "string" && typeof second.model.value == "string") {
      let result = first.model.value + second.model.value;
      if(bothWereNonEditActions) return result;
      return New(result);
    } else if(Array.isArray(first.model.value) && Array.isArray(second.model.value)) {
      let newChildren = [];
      let newModel = [];
      let length = 0;
      forEach(first.model.value, (c, k) => {
        newModel[k] = c;
        length = k + 1;
      });
      forEachChild(first, (c, k) => {
        newChildren[k] = c;
        length = Math.max(length, k + 1);
      });
      forEach(second.model.value, (c, k) => {
        newModel[k + length] = c;
      });
      forEachChild(second, (c, k) => {
        if(typeof k === "string") throw "string"
        newChildren[k + length] = c;
      });
      return New(newChildren, newModel);
    }
    return undefined;
  }

  // apply(Concat(1, New([Down(5)]), Reuse()), [0, 1, 2, 3, 4, x]) = [x] ++ [0, 1, 2, 3, 4, x]
  function Concat(count, first, second, replaceCount, firstReuse, secondReuse) {
    if(replaceCount !== undefined) {
      if(firstReuse) {
        console.trace("/!\\ Warning, unexpected firstReuse with a Replace");
        firstReuse = undefined;
      }
      if(secondReuse) {
        console.trace("/!\\ Warning, unexpected secondReuse with a Replace")
        secondReuse = undefined;
      }
    }
    let firstWasRaw = false;
    let secondWasRaw = false;
    if(!isEditAction(first)) {firstWasRaw = true; first = New(first); };
    if(!isEditAction(second)) {secondWasRaw = true; second = New(second); };
    if(replaceCount === undefined) {
      if(isConst(first) && isConst(second)) {
        let optimized = optimizeConcatNew(first, second, firstWasRaw, secondWasRaw);
        if(optimized !== undefined) return optimized;
      }
    }
    if(replaceCount === undefined && !firstReuse && !secondReuse) {
      // We gather all concats to the right
      if(first.ctor == Type.Concat) {
        second = Concat(count - first.count, first.second, second);
        count = first.count;
        first = first.first;
      }
      // Merge consecutive offsets
      if(first.ctor == Type.Down && second.ctor == Type.Down && first.isRemove === second.isRemove) {
        if(isOffset(first.keyOrOffset) && isOffset(second.keyOrOffset)) {
          let {count: c1, newLength: n1, oldLength: o1} = first.keyOrOffset;
          let {count: c2, newLength: n2, oldLength: o2} = second.keyOrOffset;
          
          if(n1 !== undefined && c1 + n1 == c2 && isIdentity(first.subAction) && isIdentity(second.subAction)) {
            return SameDownAs(first)(Offset(c1, PlusUndefined(n1, n2), MinUndefined(o1, o2)));
          }
        }
      }
      if(replaceCount === 0) return second;
      if(outLength(second) === 0) return first;
    }
    if(replaceCount !== undefined) {
      if(outLength(second) === 0 && first.ctor == Type.Down && isOffset(first.keyOrOffset)) {
        return RemoveExcept(first.keyOrOffset, first.subAction);
      }
    }
    if(secondReuse && !firstReuse) {
      // A prepend. Maybe the second one is an prepend?
      if(isConst(first) && isPrepend(second) && isConst(second.first)) {
        let optimizedConcat = optimizeConcatNew(first, second.first, firstWasRaw, undefined);
        if(optimizedConcat !== undefined) {
          return Prepend(count + second.count, optimizedConcat, second.second);
        }
      }
    }
    if(firstReuse && !secondReuse) {
      if(isConst(second) && isAppend(first) && isConst(first.second)) {
        let optimizedConcat = optimizeConcatNew(first.second, second, undefined, secondWasRaw);
        if(optimizedConcat !== undefined) {
          return Append(first.count, first.first, optimizedConcat);
        }
      }
    }
    let result = {ctor: Type.Concat, count, first: rawIfPossible(first, firstWasRaw), second: rawIfPossible(second, secondWasRaw), replaceCount, firstReuse, secondReuse};
    if(replaceCount !== undefined) {
      let [inCount, outCount, left, right] = argumentsIfReplace(result);
      if(right !== undefined) {
        let [keepCount, keepSub] = argumentsIfReplaceIsKeep(inCount, outCount, left, right);
        if(keepSub !== undefined) {
          let [keepCount2, keepSub2] = argumentsIfKeep(keepSub);
          if(keepSub2 !== undefined) {
            return Keep(keepCount + keepCount2, keepSub2);
          }
          let [keepOnlyCount, keepOnlySub] = argumentsIfKeepOnly(keepSub);
          if(keepOnlySub !== undefined && isIdentity(keepOnlySub)) {
            return KeepOnly(keepCount + keepOnlyCount);
          }
        }
      }
      // TODO: Optimizations when first and second are just Reuse.
    }
    return result;
  }
  editActions.Concat = Concat;
  
  /** We will have by definition:
     apply(Custom(S, ap, up), r, rCtx)
   = ap(apply(S, r, rCtx))

   update should satisfy the following law:
   if apply(U, apply(Custom{S, ap, up), r, rCtx), CTX) is defined, then
   apply(up(U), apply(S, r, rCtx), CTX) is defined
  */
  
  // apply(Custom(Down("x"), n => n + 1, ean => New(ean.model - 1)), {x: 2}) = 3
  function Custom(subAction, applyOrLens, update, name) {
     var lens;
     if(typeof applyOrLens == "object") {
       lens = {...applyOrLens};
     } else {
       lens = {apply: applyOrLens, update: update, name: (applyOrLens && applyOrLens.name) || (update && update.name) || name ||  "<anonymou>"};
     }
     let ap = lens.apply;
     lens.apply = function(input, r, rCtx) {
       lens.cachedInput = input;
       let output = ap.bind(lens)(input, r, rCtx);
       lens.cachedOutput = output;
       return output;
     }
     return {ctor: Type.Custom, subAction: subAction, lens: lens/*, toString: stringOf*/};
  }
  editActions.Custom = Custom;
  
  // apply(Reuse({a: UseResult(Up("a"))}), {a: 1}) = {a: {a: {a: ...}}}
  function UseResult(subAction) {
    return {ctor: Type.UseResult, subAction: subAction};
  }
  editActions.UseResult = UseResult;
  
  // apply(Sequence(e1, e2, ectx), x, xctx)
  // = apply(Custom(e1, ((y, r, rCtx) => apply(e2, y, apply(ectx, r, rCtx)), B)), x, xctx)
  // = ((y, r, rCtx) => apply(e2, y, apply(ectx, r, rCtx)))(apply(e1, x, xctx), x, xctx)
  // = apply(e2, apply(e1, x, xctx), apply(ectx, x, xctx))
  function Sequence(firstAction, secondAction, firstActionContext) {
    return Custom(firstAction,
      {apply: (x, r, rCtx) => apply(secondAction, x, apply(firstActionContext, r, rCtx)),
       backPropagate: (backPropagate, U, oldInput, oldOutput, firstAction, firstActionContext) => {
         printDebug("backPropagate inside Sequence!", U, oldInput, oldOutput, firstAction, firstActionContext);
         // TODO: Test this more extensively
         let UBeforeSecond = backPropagate(secondAction, U, firstActionContext);
         // Top-level needs top-level propagation.
         let [E, initUp] = originalFirstActionAndContext(firstAction, firstActionContext);
         return backPropagate(E, UBeforeSecond, initUp);
       },
      name: () => "Follow this by " + stringOf(secondAction) + " under " + stringOf(firstActionContext),
      secondAction, firstActionContext});
  }
  editActions.Sequence = Sequence;
  
  // Non-deterministic edit action.
  // apply(Choose(E1, E2), x, xCtx) = {[choose]: [apply(E1, x, xCtx), apply(E2, x, xCtx)]};
  function Choose() {
    let subActions = Collection.flatMap(arguments, x => isEditAction(x) && x.ctor == Type.Choose ? x.subActions : x);
    let subAction = Collection.onlyElemOrDefault(subActions, undefined);
    if(subAction) {
      return subAction;
    } else {
      return {ctor: Type.Choose, subActions: subActions};
    }
  }
  editActions.Choose = Choose;
  
  function first(editAction) {
    if(!isEditAction(editAction)) {
      if(Array.isArray(editAction)) {
        let o = [];
        for(let k in editAction) {
          o[k] = first(editAction[k]);
        }
        return o;
      } else if(typeof editAction === "object") {
        let o = {};
        for(let k in editAction) {
          o[k] = first(editAction[k]);
        }
        return o;
      } else {
        return editAction;
      }
    }
    switch(editAction.ctor) {
      case Type.New:
        return New(mapChildren(editAction.childEditActions, (k, c) => first(c)), editAction.model);
      case Type.Concat:
        return Concat(editAction.count, first(editAction.first), first(editAction.second), editAction.replaceCount, editAction.firstReuse, editAction.secondReuse);
      case Type.Custom:
        return Custom(first(editAction.subAction), editAction.lens);
      case Type.Up:
        return Up(editAction.keyOrOffset, first(editAction.subAction));
      case Type.Down:
        return SameDownAs(editAction)(editAction.keyOrOffset, first(editAction.subAction));
      case Type.Choose:
        return first(Collection.firstOrDefault(editAction.subActions, Reuse()));
      case Type.Clone:
        return Clone(first(editAction.subAction));
      default:
        return editAction;
    }
  }
  editActions.first = first;
  
  // Modify an edit action in-place to remove all the Choose statements.
  function firstRewrite(firstEditAction) {
    let done = true;
    if(typeof firstEditAction === "object" && firstEditAction.ctor == Type.Choose) {
      firstEditAction = Collection.firstOrDefault(firstEditAction.subActions, Reuse());
    }
    // list of edit action, their parent, and the key at which they are attached
    let stack = [[firstEditAction, null, null]];
    while(stack.length > 0) {
      let [editAction, key, parent] = stack.pop();
      if(!isEditAction(editAction)) {
        if(typeof editAction === "object") {
          for(let k in editAction) {
            stack.push([editAction[k], k, editAction]);
          }
          continue;
        }
        continue;
      }
      switch(editAction.ctor) {
        case Type.New:
          for(let k in editAction.childEditActions) {
            stack.push([editAction.childEditActions[k], k, editAction.childEditActions]);
          }
          break;
        case Type.Concat:
          stack.push([editAction.first, "first", editAction]);
          stack.push([editAction.second, "second", editAction]);
          break;
        case Type.Up:
        case Type.Down:
        case Type.Clone:
        case Type.Custom:
          stack.push([editAction.subAction, "subAction", editAction]);
          break;
        case Type.Choose:
          var newEdit = Collection.firstOrDefault(editAction.subActions, Reuse());
          parent[key] = newEdit;
          stack.push([newEdit, key, parent]);
          break;
          stack.push([editAction.subAction, "subAction", editAction]);
        default:
          return editAction;
      }
    }
    return firstEditAction;
  }
  editActions.firstRewrite = firstRewrite;
  
  // Change the way the edit action will be back-propagated.
  function Clone(editAction = Reuse()) {
    if(isObject(editAction) && editAction.ctor == Type.Clone) return editAction;
    return {ctor: Type.Clone, subAction: editAction};
  }
  editActions.Clone = Clone;
  
  //// HELPERS and syntactic sugar:
  // Extend, Reuse, Replace, Interval Prepend, Keep, Remove, RemoveAll, RemoveExcept
 
  function Extend(childEditActions, create=false) {
    return New(childEditActions, ExtendModel(create));
  }
  editActions.Extend = Extend;
  
  // apply(Reuse({a: New(1)}), {a: 2, b: 3}) = {a: 1, b: 3}
  function Reuse(childEditActions, create=false) {
    let newChildEditActions = mapChildren(
      childEditActions, (k, c) => Down(k, c),
      /*canReuse*/false,
      (newChild, k) => !isObject(newChild) || newChild.ctor !== Type.Down || newChild.keyOrOffset !== k || !isIdentity(newChild.subAction)
      );
    return Extend(newChildEditActions, create);
  }
  editActions.Reuse = Reuse;
  
  function ReuseAsIs(childEditActions) {
    let newChildEditActions = mapChildren(
      childEditActions, (k, c) => typeof c != "object" ? Down(k, New(c)) : Down(k, c),
      /*canReuse*/false,
      (newChild, k) => !isObject(newChild) || newChild.ctor !== Type.Down || newChild.keyOrOffset !== k || !isIdentity(newChild.subAction)
      );
    return New(newChildEditActions, ExtendModel(true));
  }
  editActions.ReuseAsIs = ReuseAsIs;
  
  // A constant, useful for pretty-printing
  var WRAP = true;
  editActions.WRAP = WRAP;
  var NEW = false;
  editActions.NEW = NEW;
  // The intent is that the element at key is the one that reuses the original record.
  // If no key is provided
  function Insert(key, childEditActions) {
    if(!isObject(childEditActions)) return New(childEditActions);
    let treeOps = treeOpsOf(childEditActions);
    let modelValue = treeOps.init();
    treeOps.update(modelValue, key, WRAP);
    return New(childEditActions, ConstModel(modelValue));
  }
  editActions.Insert = Insert;
  
  function InsertAll(childEditActions) {
    if(!isObject(childEditActions)) return New(childEditActions);
    let treeOps = treeOpsOf(childEditActions);
    let modelValue = treeOps.init();
    treeOps.forEach(childEditActions, (c, k) => {
      treeOps.update(modelValue, k, WRAP);
    });
    return New(childEditActions, ConstModel(modelValue));
  }
  editActions.InsertAll = InsertAll;
 
  function Interval(start, endExcluded) {
    return Offset(start, MinusUndefined(endExcluded,  start));
  }
  editActions.Interval = Interval;
 
  // A Concat that operates on two non-overlapping places of an array or string
  function Replace(inCount, outCount, first, second) {
    if(arguments.length == 3) second = Reuse();
    // TODO: Merge Reuse using mapUpHere
    if(isIdentity(first) && isIdentity(second)) {
      return second;
    }
    if(isEditAction(outCount) && arguments.length == 3) {
      second = first;
      first = outCount;
      outCount = outLength(first, inCount);
      if(outCount === undefined) {
        console.log("/!\\ Warning, could not infer outCount for " + stringOf(first) + " under context " + inCount);
        outCount = inCount;
      }
    }
    // Should we keep empty replaces?
    if(inCount == 0 && outCount == 0) return second;
     // Optimization that is nice to remove empty first actions. But do we want to remove empty first actions?
    /*if(outCount == 0) {
      return RemoveExcept(Offset(inCount), second);
    }*/
    return Concat(outCount, Down(Offset(0, inCount), first), Down(Offset(inCount), second), inCount);
  }
  editActions.Replace = Replace;
  
  // Return true if an edit action can be viewed as a replace
  function isReplace(editAction) {
    return typeof editAction == "object" && editAction.ctor == Type.Concat && editAction.replaceCount !== undefined;
  }
  
  // Returns the [inCount, outCount, first, second] if the element is a Replace, such that:
  // applyZ(Concat(outCount, Down(Offset(0, inCount), first), Down(Offset(inCount), second)), rrCtx) = applyZ(editAction, rrCtx);
  function argumentsIfReplace(editAction) {
    if(!isReplace(editAction)) return [];
    return [editAction.replaceCount, editAction.count, Up(Offset(0, editAction.replaceCount), editAction.first), Up(Offset(editAction.replaceCount), editAction.second)];
  }
  
  // returns [count, subAction] if the argument is a Keep
  function argumentsIfKeep(editAction) {
    //printDebug("argumentsIfKeep", editAction);
    let [inCount, outCount, first, second] = argumentsIfReplace(editAction);
    return argumentsIfReplaceIsKeep(inCount, outCount, first, second);
  }
  // returns [count, subAction] if the Replace arguments describe a Keep
  function argumentsIfReplaceIsKeep(inCount, outCount, first, second) {
    //printDebug("argumentsIfReplaceIsKeep", inCount, outCount, first, second);
    if(second === undefined || inCount != outCount || !(
      isIdentity(first) || first.ctor == Type.Down && isIdentity(first.subAction) &&
        first.keyOrOffset.count == 0 && first.keyOrOffset.newLength == inCount)) return [];
    //printDebug("argumentsIfReplaceIsKeep success", [inCount, second]);
    return [inCount, second];
  }
  
  function argumentsIfKeepOnly(editAction) {
    if(!isRemoveExcept(editAction)) return [];
    let {count, newLength, oldLength} = editAction.keyOrOffset;
    if(count !== 0 || oldLength !== undefined) return [];
    return [newLength, editAction.subAction];
  }
  function isKeepOnly(editAction) {
    let [n, e] = argumentsIfKeepOnly(editAction);
    return n !== undefined;
  }
  
  // first is the thing to prepend (in the current context of the slice), second is the remaining (default is Reuse()).
  function Prepend(count, first, second = Reuse()) {
    return Concat(count, first, second, undefined, false, true);
  }
  function Append(count, first, second) {
    if(arguments.length == 2) {
      second = first;
      first = Reuse();
    }
    if(!isEditAction(second)) { // Otherwise it cause problems when composing.
      second = New(second);
    }
    return Concat(count, first, second, undefined, true, false);
  }
  editActions.Prepend = Prepend;
  editActions.Append = Append;
  
  function Keep(count, subAction) {
    if(count == 0) return subAction;
    if(isIdentity(subAction)) return subAction;
    return Replace(count, count, Reuse(), subAction);
    // Concat(count, Down(Offset(0, count)), Down(Offset(count, subAction))
  }
  editActions.Keep = Keep;
  
  editActions.DropExcept = Down;
  
  // Remove back-propagates deletions, not building up the array. To build up the array, prefix the Replace with a Down(Offset(0, totalLength, undefined), 
  function Remove(count, subAction = Reuse()) {
    return RemoveExcept(Offset(count), subAction);
    // return Down(Offset(count), subAction); 
    // return Replace(count, 0, New(?), subAction)
  }
  editActions.Remove = Remove;
  
  function Drop(count, subAction = Reuse()) {
    return Down(Offset(count), subAction);
  }
  editActions.Drop = Drop;
  
  // If oldLength is provided, will position the current cursor at oldLength, the end of the array.
  function RemoveAll(subAction, oldLength) {
    if(isEditAction(oldLength) || typeof subAction == "number") {
      let tmp = subAction;
      subAction = oldLength;
      oldLength = tmp;
    }
    if(subAction === undefined) {
      subAction = Reuse();
    }
    return RemoveExcept(Offset(oldLength !== undefined ? oldLength : 0, 0, oldLength), subAction);
  }
  editActions.RemoveAll = RemoveAll;
  
  function DropAll(subAction, oldLength) {
    if(isEditAction(oldLength) || typeof subAction == "number") {
      let tmp = subAction;
      subAction = oldLength;
      oldLength = tmp;
    }
    if(subAction === undefined) {
      subAction = Reuse();
    }
    return Down(Offset(oldLength !== undefined ? oldLength : 0, 0, oldLength), subAction);
  }
  editActions.DropAll = DropAll;
  
  function KeepOnly(count, subAction = Reuse()) {
    return RemoveExcept(Offset(0, count), subAction);
  }
  editActions.KeepOnly = KeepOnly;
  function DropAfter(count, subAction = Reuse()) {
    return Down(Offset(0, count), subAction);
  }
  editActions.DropAfter = DropAfter;
  
  // ReuseOffset(offset, X) is to Down(offset, X)
  // what Reuse({key: X}) is to Down(key, X)
  // Specification:
  // apply(ReuseOffset(Offset(c, n, o), replaced, subAction), r, rCtx)
  // = apply(Down(Offset(0, c, o)), r, rCtx) ++c apply(subAction, r[c..c+n], (Offset(c, n, o), r):: rCtx) ++replaced apply(Down(Offset(c+n, o-(c+n), o)), r, rCtx)
  function ReuseOffset(offset, subAction, replaced) {
    printDebug("ReuseOffset", offset, replaced, subAction);
    if(offset.count > 0) {
      return Keep(offset.count, ReuseOffset(Offset(0, offset.newLength, MinusUndefined(offset.oldLength, offset.count)), subAction, replaced));
    }
    if(offset.newLength === undefined) {
      return arguments.length == 2 ? replaced : subAction;
    }
    // Here we need to append the remaining elements after offset.newLength which were untouched.
    if(replaced === undefined) {
      replaced = outLength(subAction, offset.newLength);
    }
    if(replaced === undefined) {
      console.log("/!\\ In ReuseOffset, could not infer the length of " + stringOf(subAction) + " even on the context of length " + offset.newLength + ". Will assume the context's length.");
      replaced = offset.newLength;
    }
    let wrapped = subAction;
    if(replaced === 0) {
      wrapped = Remove(offset.newLength);
    } else { // replaced > 0
      if(offset.newLength > 0) {
        if(isRemoveExcept(wrapped) && wrapped.keyOrOffset.newLength === undefined) {
          // No change necessary
        } else if(isPrepend(wrapped) && isIdentity(wrapped.second)) {
          // No change necessary
        } else {
          let [keepCount, keepSub] = argumentsIfKeep(wrapped);
          if(isRemoveAll(keepSub) && keepCount === offset.newLength) {
            wrapped = identity;
          } else {
            printDebug("replaced", offset.newLength, replaced, wrapped);
            wrapped = Replace(offset.newLength, replaced, wrapped);
          }
        }
      } else { // offset.newLength == 0, we had to insert something in this context.
        if(!isPrepend(wrapped)) {
          wrapped = Prepend(replaced, wrapped);
        }
      }
    }
    printDebug("ReuseOffset returns ", wrapped);
    /**
      Proof: when replaced == 0 and subAction is Down
      apply(ReuseOffset(Offset(c, n, o), 0, U), r, rCtx)
      = apply(Keep(c, Remove(n)), r, rCtx)
      = apply(Down(Offset(0, c)), r, rCtx) ++c
        apply(Down(Offset(c), Remove(n)), r, rCtx)
      = apply(Down(Offset(0, c)), r, rCtx) ++c
        apply(subAction, r[c..c+n], (Offset(c, n, o), r):: rCtx) ++0
        apply(Down(Offset(c), Down(Offset(n),)), r, rCtx)
      = apply(Down(Offset(0, c)), r, rCtx) ++c
        apply(subAction, r[c..c+n], (Offset(c, n, o), r):: rCtx) ++0
        apply(Down(Offset(c+n)), r, rCtx)
      QED;
    */
    return wrapped;
  }
  editActions.ReuseOffset = ReuseOffset;
  function ReuseKeyOrOffset(keyOrOffset, subAction, outLengthAction) {
    if(isOffset(keyOrOffset)) {
      return ReuseOffset(keyOrOffset, subAction, outLengthAction);
    } else {
      return Reuse({[keyOrOffset]: subAction});
    }
  }
  editActions.ReuseKeyOrOffset = ReuseKeyOrOffset;
  
  function isRemoveAll(editAction) {
    return isRemoveExcept(editAction) && editAction.keyOrOffset.newLength === 0;
  }
  function isRemove(editAction) {
    return isRemoveExcept(editAction) && editAction.keyOrOffset.newLength === undefined;
  }
  function isPrepend(editAction) {
    return typeof editAction == "object" && editAction.ctor == Type.Concat && editAction.secondReuse && !editAction.firstReuse && editAction.replaceCount === undefined;
  }
  function isAppend(editAction) {
    return typeof editAction == "object" && editAction.ctor == Type.Concat && editAction.firstReuse && !editAction.secondReuse && editAction.replaceCount === undefined;
  }
  function isConcat(editAction) {
    return typeof editAction == "object" && editAction.ctor == Type.Concat;
  }

  // Proof:
  // apply(Down(Offset(c1, n1, o1), Down(Offset(c2, n2, o2), E)), r, ctx) (assumes r has length o1)
  // = apply(Down(Offsetc2, n2, o2), E), r[c1..c1+n1[, (Offset(c1, n1), r)::ctx) and o2 == n1
  // = apply(E, r[c1..c1+n1[ Inter [c1+c2, c1+c2+n2[,  
  // = apply(E, r[c1+c2, Min(c1+n1, c1+c2 + n2)[
  // = apply(E, r[c1+c2, c1+c2+Min(n1-c2, n2)[
  // = apply(Down(Offset(c1+c2, Min(n1-c2, n2), o1), Reuse())), r, ctx)
  
  // Compose Down(offset1) after Down(offset2)
  function downDownOffset(offset1, offset2) {
    return Offset(offset1.count + offset2.count, MinUndefined(offset2.newLength, MinusUndefined(offset1.newLength, offset2.count)), offset1.oldLength);
  }
  
  // Proof:
  // apply(Down(Offset(c1, n1, o1), Up(Offset(c2, n2, o2), E)), r, ctx)
  // = apply(Up(Offset(c2, n2, o2), E), r[c1,c1+n1[, (Offset(c1, n1), r)::ctx) and r has length o1
  //     newOffset: c1 - c2
  //     newLength: o2
  // = apply(E, r[(c1-c2)..(c1-c2)+o2[, ...
  // = apply(Up(Offset(c1-c2, o1, o2), E), r, ctx)
  // Ok so we cannot convert this to a Down unless
  //   c1 - c2 < 0
  //  AND o2 <= o1
  function downUpOffsetReturnsUp(offset1, offset2) {
    return Offset(offset2.count - offset1.count, offset1.oldLength, offset2.oldLength);
  }
  
  // Proof
  // apply(Up(Offset(c1, n1, o1), Down(Offset(c2, n2, o2), E)), r[a..a+b[, (Offset(a, b), r)::ctx)
  //   First, n1 = b
  // = apply(Down(Offset(c2, n2, o2), E), r[a-c1, a-c1+o1[, (....))
  //    Second, o2 = o1
  // = apply(E, r [a-c1+c2, a-c1+c2+o1[ /\ ]a-c1+c2, a-c1+c2+n2|)
  // = apply(E, r [a-c1+c2, a-c1+c2+Min(o1, n2)|)
  // = apply(Up(Offset(c1-c2, n1, Min(o1, n2)), E), r[a,a+n1[, (Offset(a, n1), r)::ctx)
  function upDownOffsetReturnsUp(offset1, offset2) {
    return Offset(offset1.count - offset2.count, offset1.newLength, MinUndefined(offset1.oldLength, offset2.newLength));
  }
  
  // Proof
  // apply(Up(Offset(c1, n1, o1), Up(Offset(c2, n2, o2), E)), r[a,a+b[, (Offset(a, b), r)::ctx)
  //   First n1 = b
  // apply(Up(Offset(c2, n2, o2), E), r[a-c1, a-c1+o1[, ....
  //    Second n2 = o1
  // = apply(E, r[a-c1-c2,a-c1-c2+o2[, ...)
  // = apply(Up(Offset(c1+c2, n1, n2), E), r[a,a+n1[, (Offset(a, n1), r)::ctx)
  
  // Up offset that can be converted to down only if c1+c2 < 0 and n2 <= n1
  function upUpOffset(offset1, offset2) {
    return Offset(offset1.count + offset2.count, MinUndefined(offset1.newLength, MinusUndefined(offset2.newLength, offset1.count)), offset2.oldLength);
  }
  // Might not work if the new given length is larger than the given old length
  function upToDownOffset(offset) {
    if(offset.count <= 0 && LessThanEqualUndefined(MinusUndefined(offset.oldLength, offset.count), offset.newLength)) {
      return Offset(-offset.count, offset.oldLength, offset.newLength);
    }
    return undefined;
  }
  // Converts a down offset to an up offset.
  function downToUpOffset(offset) {
    return Offset(-offset.count, offset.oldLength, offset.newLength);
  }
  
  // When we go down one key or one Offset, element of the context lisit
  function ContextElem(keyOrOffset, prog) {
    return {keyOrOffset: keyOrOffset, prog: prog};
  }
  editActions.__ContextElem = ContextElem;
  
  // Tells the context what key were used from the current program (or edit action) to arrive at the current edit action.
  function AddContext(keyOrOffset, prog, ctx) {
    printDebug("AddContext", keyOrOffsetToString(keyOrOffset))
    let kIsOffset = isOffset(keyOrOffset);
    if(kIsOffset) {
      // We also record the length of the previous offset if there was one.
      let oldLength = undefined;
      let tmpCtx = ctx;
      while(typeof tmpCtx == "object") {
        if(tmpCtx.ctor == Type.Up || tmpCtx.ctor == Type.Down) {
          tmpCtx = tmpCtx.subAction;
        } else {
          if(isOffset(tmpCtx.hd.keyOrOffset)) {
            oldLength = tmpCtx.hd.keyOrOffset.newLength;
          }
          break;
        }
      }
      if(oldLength !== undefined) {
        keyOrOffset = Offset(keyOrOffset.count, keyOrOffset.newLength, oldLength);
      }
    }
    
    if(kIsOffset && isOffsetIdentity(keyOrOffset)) {
      return ctx;
    }
    let newContextElem = ContextElem(keyOrOffset, prog);
    return List.cons(newContextElem, ctx);
    //}
  }
  editActions.__AddContext = AddContext;
  
  // Slices prog along the given offset
  function applyOffset(offset, prog) {
    let monoid = monoidOf(prog);
    return monoid.sub(prog, offset.count, offset.newLength);
  }
  
  // Goes down along the key on the given program.
  function applyKey(key, prog) {
    let treeOps = treeOpsOf(prog);
    return treeOps.access(prog, key);
  }
  
  // Applies the key or offset to the given program.
  function applyKeyOrOffset(keyOrOffset, prog) {
    if(isOffset(keyOrOffset)) {
      return applyOffset(keyOrOffset, prog);
    } else {
      return applyKey(keyOrOffset, prog);
    }
  }
  
  // Apply an edit action to a program in a context.
  // Does not consume stack.
  function apply(editAction, prog, ctx, resultCtx) {
    let stack = [];
    let done = false;
    let result = "";
    let applying  = "";
    let stackHead = undefined;
    while(!done) {
      if(editActions.__debug) {
        print("applyWithoutStack(", editAction, prog, ctx, "\n|-applying", applying, "\n|-stackHead", applying === "" ? "<irrelevant>" : stackHead, "\n|-stack", stack, "\n|-result", result);
      }
      if(typeof editAction !== "object") {
        result = editAction;
        done = true;        
      } else {
        if(!isEditAction(editAction)) {
          // Maybe it's an array.
          editAction = New(editAction);
        }
        if(editAction.ctor == Type.Up) {
          let [newProg, newCtx, mbUpOffset] = walkUpCtx(editAction.keyOrOffset, prog, ctx);
          editAction = mbUpOffset ? Up(mbUpOffset, editAction.subAction) : editAction.subAction;
          prog = newProg;
          ctx = newCtx;
          applying = "";
          continue;
        }
        if(editAction.ctor == Type.Down) {
          let [newProg, newCtx] = walkDownCtx(editAction.keyOrOffset, prog, ctx);
          editAction = editAction.subAction;
          prog = newProg;
          ctx = newCtx;
          applying = "";
          continue;
        }
        if(editAction.ctor == Type.Custom) {
          if(applying === "") {
            stack.push([editAction, prog, ctx, resultCtx, "subAction"]);
            editAction = editAction.subAction;
            applying = "";
            continue;
          } else if(applying === "subAction") {
            result = editAction.lens.apply(result, prog, ctx);
            done = true;
          }
        } else if(editAction.ctor == Type.UseResult) {
          editAction = editAction.subAction;
          prog = undefined;
          ctx = resultCtx;
          resultCtx = undefined;
          continue;
        } else if(editAction.ctor == Type.Concat) {
          if(applying === "") {
            stack.push([editAction, prog, ctx, resultCtx, "first"]);
            editAction = editAction.first;
            continue;
          } else if(applying === "first") {
            let monoid = monoidOf(result);
            if(monoid.length(result) != editAction.count) {
              editAction.count = monoid.length(result);
              //console.log("/!\\ Warning, checkpoint failed. The edit action\n"+stringOf(editAction)+"\n applied to \n" +uneval(prog)+ "\n returned on the first sub edit action " + uneval(result) + "\n of length " + result.length + ", but the edit action expected " + editAction.count);
            }
            stack.push([editAction, prog, ctx, resultCtx, "second", result, monoid]);
            editAction = editAction.second;
            applying = "";
            continue;
          } else if(applying === "second") {
            let o1 = stackHead[5];
            let monoid = stackHead[6];
            let o2 = result;
            result = monoid.add(o1, o2);
            done = true;
          }
        } else if(editAction.ctor == Type.Choose) {
          // Just return the first one.
          editAction = Collection.firstOrDefault(editAction.subActions, Reuse());
          continue;
        } else if(editAction.ctor == Type.Clone) {
          editAction = editAction.subAction;
          continue;
        } else { // Extend
          let isReuse = editAction.model.ctor == TypeNewModel.Extend;
          let model = modelToCopy(editAction, prog);
          let childEditActions = editAction.childEditActions;
          if(!hasAnyProps(childEditActions)) {
            result = model;
            done = true;
          } else {
            if(typeof prog !== "object" && isReuse) {
              console.trace("apply problem. program not extensible but got keys to extend it: ", prog);
              console.log(stringOf(editAction));
              console.log("context:\n",List.toArray(ctx).map(x => uneval(x.prog, "  ")).join("\n"));
            }
            let t = treeOpsOf(model);
            let o = t.init();
            forEach(model, (c, k) => {
              t.update(o, k, c);
            });
            keys = Object.keys(childEditActions);
            if(keys.length === 0 ) {
              result = o;
              done = true;
            } else {
              if(applying === "") {
                stack.push([editAction, prog, ctx, resultCtx, 0, t, o, childEditActions, keys]);
                editAction = childEditActions[keys[0]];
                resultCtx = AddContext(keys[0], o, resultCtx);
                applying = "";
                continue;
              } else {
                let keyIndex = stackHead[4];
                let keys = stackHead[8];
                let k = keys[keyIndex];
                let t = stackHead[5];
                let o = stackHead[6];
                t.update(o, k, result);
                keyIndex++;
                let childEditActions = stackHead[7];
                if(keyIndex < keys.length) {
                  stack.push([editAction, prog, ctx, resultCtx, keyIndex, t, o, childEditActions, keys]);
                  editAction = childEditActions[keys[keyIndex]];
                  resultCtx = AddContext(keys[keyIndex], o, resultCtx);
                  applying = "";
                  continue;
                } else {
                  result = o;
                  done = true;
                }
              }
            }
          }
        }
      }
      if(done && stack.length > 0) {
        stackHead = stack.pop();
        editAction = stackHead[0];
        prog = stackHead[1];
        ctx = stackHead[2];
        resultCtx = stackHead[3];
        applying = stackHead[4];
        done = false;
      }
    }
    return result;
  }
  editActions.apply = apply;
  
  // Applies the edit action to the given program/context
  /*function apply(editAction, prog, ctx, resultCtx) {
    if(editActions.__debug) {
      console.log("apply(");
      console.log(stringOf(editAction));
      console.log(uneval(prog));
      console.log("-|" + List.toArray(ctx).map(prog => uneval(prog)).join(","));
    }
    if(!isObject(editAction) || !(editAction.ctor in Type)) {
      return apply(New(editAction), prog, ctx, resultCtx);
    }
    if(editAction.ctor == Type.Up) {
      let [newProg, newCtx, mbUpOffset] = walkUpCtx(editAction.keyOrOffset, prog, ctx);
      return apply(mbUpOffset ? Up(mbUpOffset, editAction.subAction) : editAction.subAction, newProg, newCtx, resultCtx);
    }
    if(editAction.ctor == Type.Down) {
      let [newProg, newCtx] = walkDownCtx(editAction.keyOrOffset, prog, ctx);
      return apply(editAction.subAction, newProg, newCtx, resultCtx);
    }
    if(editAction.ctor == Type.Custom) {
      let tmpResult = apply(editAction.subAction, prog, ctx, resultCtx);
      return editAction.lens.apply(tmpResult, prog, ctx);
    }
    if(editAction.ctor == Type.UseResult) {
      return apply(editAction.subAction, undefined, resultCtx);
    }
    if(editAction.ctor == Type.Concat) {
      let o1 = apply(editAction.first, prog, ctx, resultCtx);
      let monoid = monoidOf(o1);
      if(monoid.length(o1) != editAction.count) {
        console.log("/!\\ Warning, checkpoint failed. The edit action\n"+stringOf(editAction)+"\n applied to \n" +uneval(prog)+ "\n returned on the first sub edit action " + uneval(o1) + "\n of length " + o1.length + ", but the edit action expected " + editAction.count);
      }
      let o2 = apply(editAction.second, prog, ctx, resultCtx);
      return monoid.add(o1, o2);
    }
    if(editAction.ctor == Type.Choose) {
      // Just return the first one.
      return apply(Collection.firstOrDefault(editAction.subActions, Reuse()), prog, ctx, resultCtx);
    }
    if(editAction.ctor == Type.Clone) {
      return apply(editAction.subAction, prog, ctx, resultCtx);
    }
    let isReuse = editAction.model.ctor == TypeNewModel.Extend;
    let model = modelToCopy(editAction, prog);
    let childEditActions = editAction.childEditActions;
    if(!hasAnyProps(childEditActions)) {
      return model;
    } else if(typeof prog !== "object" && isReuse) {
      console.trace("apply problem. program not extensible but got keys to extend it: ", prog);
      console.log(stringOf(editAction));
      console.log("context:\n",List.toArray(ctx).map(x => uneval(x.prog, "  ")).join("\n"));
    }
    let t = treeOpsOf(model);
    let o = t.init();
    forEach(model, (c, k) => {
      t.update(o, k, c);
    });
    forEach(childEditActions, (child, k) => {
      printDebug("apply-child", k, child);
      t.update(o, k,
         apply(child, prog, ctx, AddContext(k, o, resultCtx)));
    });
    return o;
  }
  editActions.apply = apply;*/
  
  // Applies the edit action to the given program by mutating it.
  // Returns an edit action that, if applied on the result, would produce the original program.
  function applyMutate(editAction, prog, ctx, resultCtx) {
    if(editActions.__debug) {
      console.log("applyMutate(");
      console.log(stringOf(editAction));
      console.log(uneval(prog));
      console.log("-|" + stringOf(ctx));
    }
    let isReuse = isExtend(editAction);
    if(isReuse) {
      let recovered = {};
      forEach(editAction.childEditActions, (child, k) => {
        let editChild = Up(k, child);
        printDebug("applyMutate-child", k, editChild);
        if(isExtend(editChild)) {
          printDebug("is extend")
          // no need to assign, it will be changed.
          recovered[k] = Down(k, applyMutate(editChild, prog[k], AddContext(k, {prog, recovered: Extend(recovered)}, ctx), AddContext(k, prog, resultCtx)));
        } else {
          printDebug("is not extend")
          printDebug("recovered so far:", recovered);
          let t = treeOpsOf(prog);
          t.update(prog, k, applyMutateRecover(child, prog, Extend(recovered), ctx, AddContext(k, prog, resultCtx)));
          recovered[k] = Down(k, New(prog[k]));
        }
      });
      return Extend(recovered);
    }
    throw "Cannot mutate top-level records or strings"
  }
  editActions.applyMutate = applyMutate;
  
  // Applies the edit action to the given program/context and returns the result
  function applyMutateRecover(editAction, prog, recovered, ctx, resultCtx) {
    if(editActions.__debug) {
      console.log("applyMutateRecover(");
      console.log(stringOf(editAction));
      console.log(uneval(prog));
      console.log(uneval(recovered));
      console.log("-|" + List.toArray(ctx).map(prog => uneval(prog)).join(","));
    }
    if(!isObject(editAction) || !(editAction.ctor in Type)) {
      return applyMutateRecover(New(editAction), prog, recovered, ctx, resultCtx);
    }
    if(editAction.ctor == Type.Up) {
      let [newProgRecovered, newCtx, mbUpOffset] = walkUpCtx(editAction.keyOrOffset, prog, ctx);
      return applyMutateRecover(mbUpOffset ? Up(mbUpOffset, editAction.subAction) : editAction.subAction, newProgRecovered.prog, newProgRecovered.recovered, newCtx, resultCtx);
    }
    if(editAction.ctor == Type.Down) {
      if(isKey(editAction.keyOrOffset) && isExtend(recovered) && editAction.keyOrOffset in recovered.childEditActions) {
        let [newProg, newCtx] = walkDownCtx(editAction.keyOrOffset, prog, ctx);
        return applyMutateRecover( editAction.subAction, newProg, Up(editAction.keyOrOffset, recovered.childEditActions[editAction.keyOrOffset]), AddContext(editAction.keyOrOffset, {prog, recovered}, ctx));
      }
      let [newProg, newCtx] = walkDownCtx(editAction.keyOrOffset, prog, ctx);
      return applyMutateRecover(editAction.subAction, newProg, Reuse(), newCtx, resultCtx);
    }
    if(editAction.ctor == Type.Custom) {
      let tmpResult = applyMutateRecover(editAction.subAction, prog, recovered, ctx, resultCtx);
      return editAction.lens.apply(tmpResult, prog, ctx);
    }
    if(editAction.ctor == Type.UseResult) {
      return apply(editAction.subAction, undefined, resultCtx);
    }
    if(editAction.ctor == Type.Concat) {
      let o1 = applyMutateRecover(editAction.first, prog, recovered, ctx, resultCtx);
      let monoid = monoidOf(o1);
      if(monoid.length(o1) != editAction.count) {
        console.log("/!\\ Warning, checkpoint failed. The edit action\n"+stringOf(editAction)+"\n applied to \n" +uneval(prog)+ "\n returned on the first sub edit action " + uneval(o1) + "\n of length " + o1.length + ", but the edit action expected " + editAction.count);
      }
      let o2 = applyMutateRecover(editAction.second, prog, recovered, ctx, resultCtx);
      return monoid.add(o1, o2);
    }
    if(editAction.ctor == Type.Choose) {
      // Just return the first one.
      return applyMutateRecover(Collection.firstOrDefault(editAction.subActions, Reuse()), prog, recovered, ctx, resultCtx);
      /*return Collection.map(editAction.subActions, subAction =>
        applyMutateRecover(subAction, prog, ctx, resultCtx)
      );*/
    }
    if(editAction.ctor == Type.Clone) {
      return applyMutateRecover(editAction.subAction, prog, recovered, ctx, resultCtx);
    }
    let isReuse = editAction.model.ctor == TypeNewModel.Extend;
    if(isReuse && !isIdentity(recovered)) {
      let sub = apply(recovered, prog);
      printDebug("Applying recovered for extend", editAction, sub);
      return applyMutateRecover(editAction, sub, Reuse(), ctx, resultCtx);
    }
    let model = modelToCopy(editAction, prog);
    let childEditActions = editAction.childEditActions;
    if(!hasAnyProps(childEditActions)) {
      return model;
    } else if(typeof prog !== "object" && isReuse) {
      console.trace("applyMutateRecover problem. program not extensible but got keys to extend it: ", prog);
      console.log(stringOf(editAction));
      console.log("context:\n",List.toArray(ctx).map(x => uneval(x.prog, "  ")).join("\n"));
    }
    let t = treeOpsOf(model);
    let o = t.init();
    forEach(model, (c, k) => {
      t.update(o, k, c);
    });
    forEach(childEditActions, (child, k) => {
      printDebug("applyMutateRecover-child", k, child);
      t.update(o, k,
         applyMutateRecover(child, prog, recovered, ctx, AddContext(k, o, resultCtx)));
    });
    return o;
  }
  
  function andThenWithLog(secondAction, firstAction, firstActionContext = undefined) {
    let res = andThen(secondAction, firstAction, firstActionContext);
    if(editActions.__debug) {
      console.log("  andThen(");
      console.log("  ",addPadding(stringOf(secondAction), "  "));
      console.log("  ,", addPadding(stringOf(firstAction), "  "));
      console.log("  -|" + addPadding(stringOf(firstActionContext), "    "));
      console.log("-> ",  addPadding(stringOf(res), "   "));
    }
    return res;
  }
  
  // We want to have the top-level invariant that:
  // apply(andThen(E2, E1), r) = apply(E2, apply(E1, r))
  
  // With 1 context:
  //  By induction on the size of E1 and E2, we want to prove that
    // apply(andThen(E2, E1, E1Ctx), r, ctx)
    // == apply(E2, apply(E1, r, ctx), apply(E1Ctx, r, ctx))

  /*    
    Top-level andThen is associative
        apply(andThen(E2, andThen(E1, E0, []), []), r, rCtx)
        = apply(E2, apply(andThen(E1, E0, []), r, rCtx), apply([], r, rCtx))
        = apply(E2, apply(E1, apply(E0, r, rCtx), apply([], r, rCtx)), [])
        = apply(E2, apply(E1, apply(E0, r, rCtx), []), [])
        = apply(E2, apply(E1, apply(E0, r, rCtx), []), apply([], apply(E0, r, rCtx), [])
        = apply(andThen(E2, E1, []), apply(E0, r, rCtx), apply([], r, rCtx))
        = apply(andThen(andThen(E2, E1, []), E0, []), r, rCtx)
  */
  function rawIfPossible(editAction, requested = true) {
    if(!requested) return editAction;
    if(!isObject(editAction)) return editAction;
    if(editAction.ctor !== Type.New) return editAction;
    if(typeof editAction.model.value !== "object") return editAction.model.value;
    let notSuitable = false;
    forEach(editAction.model, (child, k) => {
      if(child == true) notSuitable = true;
    });
    if(notSuitable) {
      return editAction;
    }
    if(Array.isArray(editAction.model.value)) {
      if(Array.isArray(editAction.childEditActions)) return editAction.childEditActions;
      else return editAction;
    }
    if(editAction.model.value instanceof Map) {
      if(editAction.childEditActions instanceof Map) {
        return editAction.childEditActions;
      } else return editAction;
    }
    return editAction.childEditActions;
  }
  
  function andThen(secondAction, firstAction, firstActionContext = undefined) {
    if(editActions.__debug) {
      console.log("andThen(");
      console.log(stringOf(secondAction));
      console.log(stringOf(firstAction));
      console.log("-|" + addPadding(stringOf(firstActionContext), "  "));
    }
    let recurse = /*customRecurse || */editActions.__debug ? andThenWithLog : andThen;
    let isSecondRaw = !isEditAction(secondAction);
    let secondActionOriginal = secondAction;
    if(isSecondRaw) { // Happens when secondAction is a context, or other cases.
      secondAction = New(secondAction);
    }
    let firstActionOriginal = firstAction;
    let isFirstRaw = !isEditAction(secondAction);
    if(isFirstRaw) {
      firstAction = New(firstAction);
    }
    /** Proof:
        apply(andThen(Reuse(), E1, ECtx), r, rCtx)
        = apply(E1, r, rCtx)
        = apply(Reuse(), apply(E1, r, rCtx), apply(ECtx, r, rCtx))
    */
    if(isIdentity(secondAction)) return firstActionOriginal;
    if(firstAction.ctor == Type.Clone) {
      return Clone(recurse(secondAction, firstAction.subAction, firstActionContext));
    }
    if(secondAction.ctor == Type.Clone) {
      return Clone(recurse(secondAction.subAction, firstAction, firstActionContext));
    }
    if(firstActionContext === undefined && firstAction.ctor === Type.Custom && ("firstActionContext" in firstAction.lens) && firstAction.lens.firstActionContext === undefined) {  // It's a sequence
      /** Proof:
        apply(andThen(E2, Sequence(X, E1, E1Ctx), E2Ctx), r, rCtx)
        = apply(Sequence(X, andThen(E2, E1)), r, rCtx)
        = apply(andThen(E2, E1), apply(X, r, rCtx))
        = apply(E2, apply(E1, apply(X, r, rCtx)))
        = apply(E2, apply(E1, apply(X, r, rCtx), apply(E1Ctx, r, rCtx)), apply(E2Ctx, r, rCtx))
        = apply(E2, apply(Sequence(X, E1), r, rCtx), apply(E2Ctx, r, rCtx))
        QED;
      */
      return Sequence(firstAction.subAction, recurse(secondAction, firstAction.lens.secondAction));
    }
    if(secondAction.ctor == Type.Choose) {
      return Choose(...Collection.map(secondAction.subActions, subAction => recurse(subAction, firstActionOriginal, firstActionContext)));
    } else if(firstAction.ctor == Type.Choose) {
      return Choose(...Collection.map(firstAction.subActions, subAction => recurse(secondActionOriginal, subAction, firstActionContext)));
    } else if(secondAction.ctor == Type.Up) {
      if(firstActionContext === undefined) {
        console.trace("Error empty context for Up in andThen", firstAction, ";", secondAction);
      }
      if(firstActionContext.ctor == Type.Up) {
        /** Proof:
            apply(andThen(E2, E1, Up(m, (k, E0)::E2Ctx)), r[m], (m, r)::rCtx)
          = apply(Up(m, andThen(E2, Down(m, E1), (k, E0)::E2Ctx)), r[m], (m, r)::rCtx)  -- AP-UP-SECOND-UP
          = apply(andThen(E2, Down(m, E1), (k, E0)::E2Ctx), r, rCtx)
          = apply(E2, apply(Down(m, E1), r, rCtx), apply((k, E0)::E2Ctx, r, rCtx)) -- iND
          = apply(E2, apply(E1, r[m], (m, r)::rCtx), apply((k, E0)::E2Ctx, r, rCtx))
          = apply(E2, apply(E1, r[m], (m, r)::rCtx), apply(Up(m, (k, E0)::E2Ctx), r[m], (m, r)::rCtx)) -- GOAL
          QED
        */
        if(editActions.__debug) {
          console.log("Pre-pending Up("+ keyOrOffsetToString(firstActionContext.keyOrOffset)+", |)");
        }
        return Up(firstActionContext.keyOrOffset,
          recurse(
            secondActionOriginal,
            Down(firstActionContext.keyOrOffset, firstActionOriginal),
            firstActionContext.subAction));
      }
      if(firstActionContext.ctor == Type.Down) {
        /** Proof:
            apply(andThen(Up(k, E2), E1, Down(m, (k, E0)::E2Ctx)), r, rCtx)
          = apply(Down(m, andThen(Up(k, E2), Up(m, E1), (k, E0)::E2Ctx)), r, rCtx) -- AT-UP-SECOND-DOWN
          = apply(andThen(Up(k, E2), Up(m, E1), (k, E0)::E2Ctx), , r[m], (m, r)::rCtx) -- AP-DOWN
          = apply(Up(k, E2), apply(Up(m, E1), r[m], (m, r)::rCtx), apply((k, E0)::E2Ctx, r[m], (m, r)::rCtx)) -- IND
          = apply(Up(k, E2), apply(E1, r, rCtx), apply((k, E0)::E2Ctx, r[m], (m, r)::rCtx)) --AP-UP
          = apply(Up(k, E2), apply(E1, r, rCtx), apply(Down(m, (k, E0)::E2Ctx), r, rCtx)) --APCTX-UP -- GOAL
          QED
        */
        if(editActions.__debug) {
          console.log("[ctx] Pre-pending Down("+keyOrOffsetToString(firstActionContext.keyOrOffset), ", |)");
        }
        return Down(firstActionContext.keyOrOffset,
          recurse(
            secondActionOriginal,
            Up(firstActionContext.keyOrOffset, firstActionOriginal),
            firstActionContext.subAction));
      }
      /** Proof:
        applyZ(andThenZ(Up(ko, E2), (E1, ECtx)), (r, rCtx))
        = applyZ(andThenZ(E2, walkUpActionCtx(ko, E1, EECtx)), (r, rCtx)) -- AT-UP-SECOND
        = applyZ(E2, applyZip(walkUpActionCtx(ko, E1, EECtx)), (r, rCtx))
        = applyZ(Up(ko, E2), applyZip((E1, EECtx), (r, rCtx)))
        QED;      
      */
      let [finalFirstAction, finalFirstActionContext, newSecondUpOffset] = walkUpActionCtx(secondAction.keyOrOffset, firstActionOriginal, firstActionContext);
      return recurse(
            newSecondUpOffset ? Up(newSecondUpOffset, secondAction.subAction) : secondAction.subAction,finalFirstAction, finalFirstActionContext);
      // firstAction is Reuse, New, Custom, Concat, UseResult
      // secondAction is Down, Reuse, New, UseResult
    } else if(firstAction.ctor == Type.Down) {
      if(isOffset(firstAction.keyOrOffset)) {
        /** Proof for offset when there is already an offset on r
          apply(andThen(E2, Down(Offset(c, n, o), E1), ECtx), r[a,a+o[, (Offset(a, o), r)::rCtx)
          = apply(Down(Offset(c, n, o), andThen(E2, E1, (Offset(0), Reuse(), Up(Offset(c,n,o)))::ECtx)),  r[a,a+o[, (Offset(a, o), r)::rCtx)
          = apply(andThen(E2, E1, (Offset(0), Reuse(), Up(Offset(c,n,o)))::ECtx),  r[a+c,a+c+n[, (Offset(a+c, n), r)::rCtx)
          = apply(E2, apply(E1, r[a+c,a+c+n[, (Offset(a+c, n), r)::rCtx), apply((Offset(0), Reuse(), Up(Offset(c,n,o)))::ECtx), r[a+c,a+c+n[, (Offset(a+c, n), r)::rCtx))
          = apply(E2, apply(Down(Offset(c, n, o), E1), r[a,a+o[, (Offset(a, o), r)::rCtx), apply((Offset(0), Reuse(), Reuse())::ECtx), r[a,a+o[, (Offset(a, o), r)::rCtx))
          = apply(E2, apply(Down(Offset(c, n, o), E1), r[a,a+o[, (Offset(a, o), r)::rCtx), (Offset(0), apply(Reuse(), r[a,a+o[, (Offset(a, o), r)::rCtx))::apply(ECtx, r[a,a+o[, (Offset(a, o), r)::rCtx))
          = apply(E2, apply(Down(Offset(c, n, o), E1), r[a,a+o[, (Offset(a, o), r)::rCtx), apply(ECtx, r[a,a+o[, (Offset(a, o), r)::rCtx)) -- GOAL
          QED.
          
          
          Proof for offset when there is no offset on r (o == undefined)
          apply(andThen(E2, Down(Offset(c, n), E1), ECtx), r, rCtx)
          = apply(Down(Offset(c, n), andThen(E2, E1, (Offset(0), Reuse(), Up(Offset(c,n)))::ECtx)), r, rCtx)
          = apply(andThen(E2, E1, (Offset(0), Reuse(), Up(Offset(c,n)))::ECtx),  r[c,c+n[, (Offset(c, n), r)::rCtx)
          = apply(E2, apply(E1, r[c,c+n[, (Offset(c, n), r)::rCtx), apply((Offset(0), Reuse(), Up(Offset(c,n)))::ECtx, r[c,c+n[, (Offset(c, n), r)::rCtx))
          = apply(E2, apply(Down(Offset(c, n), E1), r, rCtx), apply((Offset(0), Reuse(), Reuse())::ECtx, r, rCtx)
          = apply(E2, apply(Down(Offset(c, n), E1), r, rCtx), (Offset(0), apply(Reuse(), r, rCtx))::apply(ECtx, r, rCtx))
          = apply(E2, apply(Down(Offset(c, n), E1), r, rCtx), (Offset(0), r)::apply(ECtx, r, rCtx))
          = apply(E2, apply(Down(Offset(c, n), E1), r, rCtx)), apply(ECtx, r, rCtx)) -- GOAL
          QED.
        */
        if(editActions.__debug) {
          console.log("[first down offset] Pre-pending Down("+keyOrOffsetToString(firstAction.keyOrOffset)+", |)");
        }
        return SameDownAs(firstAction)(firstAction.keyOrOffset, recurse(secondActionOriginal, firstAction.subAction, Up(firstAction.keyOrOffset, firstActionContext)));
      } else {
        /** Proof:
          apply(andThen(E2, Down(f, E1), (k, E0, X)::ECtx), r, rCtx)
          = apply(Down(f, andThen(E2, E1, (k, E0, Up(f, X))::ECtx)), r, rCtx)     -- AT-DOWN-FIRST
          = apply(andThen(E2, E1, (k, E0, Up(f, X))::ECtx), r[f], (f, r)::rCtx) -- AP-DOWN
          = apply(E2, apply(E1, r[f], (f, r)::rCtx), apply((k, E0, Up(f, X))::ECtx, r[f], (f, r)::rCtx)) -- IND
          = apply(E2, apply(E1, r[f], (f, r)::rCtx), apply((k, E0, X)::ECtx, r, rCtx)) -- IND
          = apply(E2, apply(Down(f, E1), r, rCtx), apply((k, E0, X)::ECtx, r, rCtx)) -- GOAL
          QED.
        */
        if(editActions.__debug) {
          console.log("[first down key] Pre-pending Down("+ keyOrOffsetToString(firstAction.keyOrOffset)+", |)");
        }
        return Down(firstAction.keyOrOffset, recurse(secondActionOriginal, firstAction.subAction, Up(firstAction.keyOrOffset, firstActionContext)));
      }
      // firstAction is Up, Reuse, New, Custom, Concat, UseResult
    } else if(firstAction.ctor == Type.Up) {
      /** Proof for keys:
        
        apply(andThen(E2, Up(f, E1), (k, E0, X)::ECtx), r[f], (f, r)::rCtx)
        = apply(Up(f, andThen(E2, E1, (k, E0, Down(f, X))::ECtx)), r[f], (f, r)::rCtx)  -- AP-UP-FIRST
        = apply(andThen(E2, E1, (k, E0, Down(f, X))::ECtx), r, rCtx)
        = apply(E2, apply(E1, r, rCtx), apply((k, E0, Down(f, X))::ECtx, r, rCtx))
        = apply(E2, apply(Up(f, E1), r[f], (f, r)::rCtx), apply((k, E0, X)::ECtx , r[f], (f, r)::rCtx))
        
        QED.
      */
      if(editActions.__debug) {
        console.log("Pre-pending Up("+ keyOrOffsetToString(firstAction.keyOrOffset)+", ...)");
      }
      return Up(firstAction.keyOrOffset, recurse(secondAction, firstAction.subAction, Down(firstAction.keyOrOffset, firstActionContext)));
      // firstAction is Reuse, New, Custom, Concat, UseResult
      // secondAction is Custom, Up, Down, Reuse, New, Concat, UseResult
    } else if(secondAction.ctor == Type.Custom) {
      if(editActions.__debug) {
        console.log("Pre-pending Custom(|, ...)");
      }
      /** Proof:
        applyZ(andThen(Custom(E, (A, B)), E1, ECtx), rrCtx)
        = applyZ(Custom(andThen(E, E1, ECtx), (A, B)), rrCtx)        
        = A(applyZ(andThen(E, E1, ECtx), rrCtx))
        = A(apply(E, applyZ(E1, rrCtx), apply(ECtx, rrCtx)))
        = apply(Custom(E, (A, B)), applyZ(E1, rrCtx), apply(ECtx, rrCtx))
        QED;
      */
      return Custom(recurse(secondAction.subAction, firstActionOriginal, firstActionContext), {...secondAction.lens});
      // firstAction is Reuse, New, Custom, Concat, UseResult
      // secondAction is Up, Down, Reuse, New, Concat, UseResult
    } else if(secondAction.ctor == Type.Concat) {
      // If we have replaces, we try to preserve them as much as possible.
      // TODO: Deal with Replace/Prepend/Append
      // Prepend's structure should be preserved as much as possible.
      // andThen(Prepend(2, Down(Offset(10, 2))), Append(10, "cd"))
      // = Prepend(2, "cd", Append(10, "cd"))
      // andThen(Keep(1, X), Prepend(3, Y, Z)))
      // = Prepend(1, y[1],)
      if(isReplace(secondAction)) {
        if(isPrepend(firstAction) || isAppend(firstAction)) {
          /** Proof. 
            apply(andThen(Replace(fc, os, ls, rs), Prepend(fc, if, rf), ECtx), r, rCtx)
            = apply(Concat(os, andThen(ls, if, (Offset(0, fc), Prepend(fc, if, rf))::ECtx), andThen(ls, rf, (Offset(fc), Prepend(fc, if, rf))::ECtx), r, rCtx)
            = apply(andThen(ls, if, (Offset(0, fc), Prepend(fc, if, rf))::ECtx), r, rCtx) ++os
              apply(andThen(ls, rf, (Offset(fc), Prepend(fc, if, rf))::ECtx), r, rCtx)
            = apply(ls, apply(if, r, rCtx), apply((Offset(0, fc), Prepend(fc, if, rf))::ECtx, r, rCtx)) ++os apply(ls, apply(rf, r, rCtx), apply((Offset(fc), Prepend(fc, if, rf))::ECtx, r, rCtx))
            = apply(ls, apply(if, r, rCtx), (Offset(0, fc), apply(Prepend(fc, if, rf), r, rCtx))::apply(ECtx, r, rCtx)) ++os apply(ls, apply(rf, r, rCtx), (Offset(fc), apply(Prepend(fc, if, rf), r, rCtx)::apply(ECtx, r, rCtx))
            = apply(Down(Offset(0, fc), ls), apply(if, r, rCtx) ++fc apply(rf, r, rCtx), apply(ECtx, r, rCtx)) ++os apply(Down(Offset(fc), ls), apply(if, r, rCtx) ++fc apply(rf, r, rCtx), apply(ECtx, r, rCtx))
            = apply(Replace(fc, os, ls, rs), apply(if, r, rCtx) ++fc apply(rf, r, rCtx), apply(ECtx, r, rCtx))
            = apply(Replace(fc, os, ls, rs), apply(Prepend(fc, if, rf), r, rCtx), apply(ECtx, r, rCtx))
            */
          let fc = firstAction.count;
          let fi = 0, lf = firstAction.first, rf = firstAction.second;
          let [os, ls, rs] = splitIn(fc, secondActionOriginal);
          if(rs !== undefined) {
            let ECtx = firstActionContext;
            let firstSubContext = AddContext(Offset(0, fc), firstActionOriginal, ECtx);
            let secondSubContext = AddContext(Offset(fc), firstActionOriginal, ECtx);
            /*Prepend(os, andThen(ls, if, (Offset(0, fc), Prepend(fc, if, rf))::ECtx), andThen(ls, rf, (Offset(fc), Prepend(fc, if, rf))::ECtx))*/
            if(editActions.__debug) {
              console.log("Filling Prepend("+fc+", |, ...)");
            }
            let newLeft = recurse(ls, lf, firstSubContext);
            if(editActions.__debug) {
              console.log("Filling Replace("+fi+", " + os + ", "+stringOf(newLeft)+", |)");
            }
            let newRight = recurse(rs, rf, secondSubContext);
            return (isPrepend(firstAction) ? Prepend : Append)(os, newLeft, newRight);
          }
        } else if(isReplace(firstAction) || isReuse(firstAction)) {
          let [fi, fc, lf, rf] = argumentsIfReplace(firstAction);
          if(isReuse(firstAction)) {
            // let's convert to Replace, so that we can enjoy this syntactic sugar.
            // Note that a Reuse might increase the length.
            let [si, sc, ls, rs] = argumentsIfReplace(secondAction);
            fi = si;
            [fc, lf, rf] = splitIn(si, firstAction); // Always returns for a Reuse
          }
          printDebug("First replace", fi, fc, lf, rf);
          let [os, ls, rs] = splitIn(fc, secondAction);
          printDebug("Second replace", os, ls, rs);
          if(fc == 0) { // rs == secondAction, we don't want infinite recursion!
            if(editActions.__debug) {
              console.log("Pre-pending Re("+secondAction.count+", | , ..., "+secondAction.replaceCount+")");
            }
            let newSecondFirst = recurse(secondAction.first, firstActionOriginal, firstActionContext);
            if(editActions.__debug) {
              console.log("Filling Concat("+secondAction.count+", ... , |, "+secondAction.replaceCount+")", secondAction.count);
            }
            let newSecondSecond = recurse(secondAction.second, firstActionOriginal, firstActionContext);
            return Concat(secondAction.count, newSecondFirst, newSecondSecond, secondAction.replaceCount);
          } else if(rf !== undefined && rs !== undefined) {
            // If two replaces, we can keep the replace structure.
            /**
               Proof. 
                  apply(andThen(Replace(fc, os, ls, rs), Replace(fi, fc, lf, rf), ECtx), r, rCtx)
                = apply(Replace(fi, os, andThen(ls, lf, ?1), andThen(ls, lf, ?2)), r, rCtx)
                = applyZ(Down(Offset(0, fi), andThen(ls, lf, ?1)), rrCtx) ++os
                  applyZ(Down(Offset(fi), andThen(rs, rf, ?2)), rrCtx)
                = apply(andThen(ls, lf, ?1), r[0..fi], (Offset(0, fi), r)::rCtx) ++os
                  apply(andThen(rs, rf, ?2), r[fi..], (Offset(fi), r)::rCtx)     -- IND
                = apply(ls, apply(lf, r[0..fi], (Offset(0, fi), r)::rCtx), apply(?1, r[0..fi], (Offset(0, fi), r)::rCtx)) ++os
                  apply(rs, apply(rf, r[fi..], (Offset(fi), r)::rCtx), apply(?2, r[fi..], (Offset(fi), r)::rCtx))
                
                // If we suppose ?1 = Up(Offset(0, fi), ?3), and ?2 = Up(Offset(fi), ?4), then
                = apply(ls, apply(lf, r[0..fi], (Offset(0, fi), r)::rCtx), apply(?3, r, rCtx)) ++os
                  apply(rs, apply(rf, r[fi..], (Offset(fi), r)::rCtx), apply(?4, r, rCtx))
                
                // Solution for ?3 = (Offset(0, fc), Replace(fi, fc, lf, rf))::ECtx
                                ?4 = (Offset(fc), Replace(fi, fc, lf, rf), r, rCtx)::ECtx
                // Replace(fi, os, andThen(ls, lf, ?1), andThen(ls, lf, ?2)
                // Hence: ?1 = Up(Offset(0, fi), (Offset(0, fc), Replace(fi, fc, lf, rf))::ECtx)
                //        ?2 = Up(Offset(fi), (Offset(fc), Replace(fi, fc, lf, rf))::ECtx)
                
                // Here, either we use mapUpHere or we prefix with Up. mapUpHere would be better because in most cases, it wouldn't change anything and yet guarantees correctness.
                // However, in this case, if we don't go up, we will never care about this Up. Hence this is the best solution.
                
                = apply(ls, apply(lf, r[0..fi], (Offset(0, fi), r)::rCtx), apply((Offset(0, fc), Replace(fi, fc, lf, rf))::ECtx, r, rCtx)) ++os
                  apply(rs, apply(rf, r[fi..], (Offset(fi), r)::rCtx),
                           apply((Offset(fc), Replace(fi, fc, lf, rf), r, rCtx)::ECtx, r, rCtx))
                = apply(ls, apply(lf, r[0..fi], (Offset(0, fi), r)::rCtx), (Offset(0, fc), apply(Replace(fi, fc, lf, rf), r, rCtx))::apply(ECtx, r, rCtx)) ++os
                  apply(rs, apply(rf, r[fi..], (Offset(fi), r)::rCtx),
                           (Offset(fc), apply(Replace(fi, fc, lf, rf), r, rCtx))::apply(ECtx, r, rCtx))
                = apply(ls, apply(Down(Offset(0, fi), lf), r, rCtx), (Offset(0, fc), apply(Replace(fi, fc, lf, rf), r, rCtx))::apply(ECtx, r, rCtx)) ++os
                  apply(rs, apply(Down(Offset(fi), rf), r, rCtx),
                           (Offset(fc), apply(Replace(fi, fc, lf, rf), r, rCtx))::apply(ECtx, r, rCtx))
                = apply(ls, apply(Down(Offset(0, fi), lf), r, rCtx), (Offset(0, fc), apply(Down(Offset(0, fi), lf), r, rCtx)
                      ++fc apply(Down(Offset(fi), rf), r, rCtx))::apply(ECtx, r, rCtx)) ++os
                  apply(rs, apply(Down(Offset(fi), rf), r, rCtx),
                           (Offset(fc), apply(Down(Offset(0, fi), lf), r, rCtx)
                      ++fc apply(Down(Offset(fi), rf), r, rCtx))::apply(ECtx, r, rCtx))
                = apply(Down(Offset(0, fc), ls),
                           apply(Down(Offset(0, fi), lf), r, rCtx)
                      ++fc apply(Down(Offset(fi), rf), r, rCtx), apply(ECtx, r, rCtx)) ++os
                  apply(Down(Offset(fc), rs),
                           apply(Down(Offset(0, fi), lf), r, rCtx)
                      ++fc apply(Down(Offset(fi), rf), r, rCtx), apply(ECtx, r, rCtx))
                = apply(Replace(fc, os, ls, rs),
                           apply(Down(Offset(0, fi), lf), r, rCtx)
                      ++fc apply(Down(Offset(fi), rf), r, rCtx), apply(ECtx, r, rCtx))
                = apply(Replace(fc, os, ls, rs), apply(Replace(fi, fc, lf, rf), r, rCtx), apply(ECtx, r, rCtx))
                QED;
            */
            let ECtx = firstActionContext;
            let firstSubContext = Up(Offset(0, fi), AddContext(Offset(0, fc), firstActionOriginal, ECtx));
            let secondSubContext = Up(Offset(fi), AddContext(Offset(fc), firstActionOriginal, ECtx));
            if(editActions.__debug) {
              console.log("Filling Replace("+fi+", " + os + ", |, ...)");
            }
            let newLeft = recurse(ls, lf, firstSubContext);
            if(editActions.__debug) {
              console.log("Filling Replace("+fi+", " + os + ", "+stringOf(newLeft)+", |)");
            }
            let newRight = recurse(rs, rf, secondSubContext);
            return Replace(fi, os, newLeft, newRight);
          }
        }
      }
      
      
      /**
        Proof:
            apply(andThen(Concat(n, E2f, E2s), E1, ECtx), r, rCtx)
          = apply(Concat(n, andThen(E2f, E1, ECtx), andThen(E2s, E1, ECtx)), r, rCtx)
          = apply(andThen(E2f, E1, ECtx), r, rCtx) ++n  apply(andThen(E2s, E1, ECtx)), r, rCtx)
          = apply(E2f, apply(E1, r, rCtx), apply(ECtx, r, rCtx)) ++n  apply(E2s, apply(E1, r, rCtx), apply(ECtx, r, rCtx))
          = apply(Concat(n, E2f, E2s), apply(E1, r, rCtx), apply(ECtx, r, rCtx))
          QED;
      */
      if(editActions.__debug) {
        console.log("Pre-pending Concat("+secondAction.count+", | , ...)");
      }
      let newSecondFirst = recurse(secondAction.first, firstActionOriginal, firstActionContext);
      if(editActions.__debug) {
        console.log("Filling Concat("+secondAction.count+", ... , |)", secondAction.count);
      }
      let newSecondSecond = recurse(secondAction.second, firstActionOriginal, firstActionContext);
      let firstReuse = secondAction.firstReuse || firstAction.firstReuse;
      let secondReuse = !firstReuse && (secondAction.secondReuse || firstAction.secondReuse);
      return Concat(secondAction.count, newSecondFirst, newSecondSecond, undefined, firstReuse, secondReuse);
      // firstAction is Reuse, New, Custom, Concat, UseResult
      // secondAction is Up, Down, Reuse, New, UseResult
    } else if(secondAction.ctor == Type.Down) {
      // We know we can go down first action now.
      let f = secondAction.keyOrOffset;
      /** Proof
      apply(andThen(Down(keyOrOffset, E2), E1, E1Ctx), r, rCtx)
      = applyZ(andThenZ(Down(keyOrOffset, E2), (E1, E1Ctx), (r, rCtx))
      = applyZ(andThenZ(E2, walkDownActionCtx(keyOrOffset, E1, E1Ctx, Reuse())), rrCtx)
      = applyZ(E2, applyZip(walkDownActionCtx(keyOrOffset, E1, E1Ctx, Reuse()), rrCtx)
      = applyZ(Down(keyOrOffset, E2), applyZip((E1, E1Ctx), (r, rCtx)))
      = apply(Down(keyOrOffset, E2), apply(E1, r, rCtx), apply(E1Ctx, r, rCtx))
      QED;
      */
      let [newFirstAction, newFirstActionContext] = walkDownActionCtx(f, firstActionOriginal, firstActionContext, secondAction.isRemove);
      return recurse(secondAction.subAction, newFirstAction, newFirstActionContext);
      // firstAction is Reuse, New, Concat, Custom, UseResult
      // secondAction is Reuse, New, UseResult
    } else if(isReuse(secondAction)) {
      // Special case of New. We should keep the structure of the first action, just modify certain things.
      if(firstAction.ctor == Type.New) {
        /** Proof (key)
          apply(andThen(Reuse({f: E2}), New({f: E1}), E2Ctx), r, rCtx)
        = apply(New({f: andThen(E2, E1, (f, New({f: E1}), Reuse())::E2Ctx)}), r, rCtx) -- AT-REUSE-NEW1
        = {f: apply(andThen(E2, E1, (f, New({f: E1}), Reuse())::E2Ctx), r, rCtx)}  -- AP-NEW
        = {f: apply(E2, apply(E1, r, rCtx), apply((f, New({f: E1}), Reuse())::E2Ctx, r, rCtx))} -- IND
        = {f: apply(E2, apply(E1, r, rCtx), (f, apply(New({f: E1}), r, rCtx))::apply(E2Ctx, r, rCtx))} -- IND
        = {f: apply(E2, apply(E1, r, rCtx), (f, {f: apply(E1, r, rCtx)})::apply(E2Ctx, r, rCtx))} -- AP-New
        = apply(Reuse({f: E2}), {f: apply(E1, r, rCtx)}, apply(E2Ctx, r, rCtx))
        = apply(Reuse({f: E2}), apply(New({f: E1}), r, rCtx), apply(E2Ctx, r, rCtx)) -- GOAL
        */
        let newChildren = {};
        let firstIsReuse = isReuse(firstAction);
        forEach(firstAction.childEditActions, (firstChild, k) => {
          if(!(k in secondAction.childEditActions)) {
            newChildren[k] = firstChild;
          } else {
            // For key ordering, first actions come first.
            newChildren[k] = undefined;
          }
        });
        forEach(secondAction.childEditActions, (secondChild, k) => {
          if(editActions.__debug) {
            console.log("Inside "+(firstIsReuse ? "Reuse" : "New")+"({ " + k + ": ");
          }
          newChildren[k] = recurse(secondChild, firstActionOriginal, firstActionContext);
        });
        if(firstIsReuse) {
          return New(newChildren, ExtendModel(secondAction.model.create || firstAction.model.create));
        } else {
          return rawIfPossible(New(newChildren, firstAction.model), isFirstRaw);
        }
      } else if(firstAction.ctor == Type.Concat) {
        /** Assume f < n, g >= n
          //   apply(Reuse({k: Ek}), r, rCtx)
  // = r[0..c[ ++c apply(Reuse({(k-c): mapUpHere(Ek, Offset(c, n), Up(k))}), r[c..c+n[, (Offset(c, n), r)::rCtx)
        
    Proof:
   apply(andThen(Reuse({f: E2m, g: E2p}), Concat(n, E1f, E1s), ECtx), r, rCtx);
= apply(
  Concat(n,
    andThen(
      Reuse({f: mapUpHere(E2m, Offset(0, n), Up(f))}),
      E1f,
      (Offset(0, n), Concat(n, E1f, E1s), Reuse())::ECtx),
    andThen(
      Reuse({(g-n): mapUpHere(E2p, Offset(n), Up(g))}),
      E1s,
      (Offset(n), Concat(n, E1f, E1s), Reuse())::ECtx)),
  r, rCtx) -- AT-REUSE-SECOND-CONCAT-FIRST
= apply(
  andThen(
    Reuse({f: mapUpHere(E2m, Offset(0, n), Up(f))}),
    E1f,
    (Offset(0, n), Concat(n, E1f, E1s), Reuse())::ECtx),
  r, rCtx)
  ++n
  apply(
  andThen(
    Reuse({(g-n): mapUpHere(E2p, Offset(n), Up(g))}),
    E1s,
    (Offset(n), Concat(n, E1f, E1s), Reuse())::ECtx),
  r, rCtx)
= apply(
  Reuse({f: mapUpHere(E2m, Offset(0, n), Up(f))}),
    apply(E1f, r, rCtx),
  apply((Offset(0, n), Concat(n, E1f, E1s), Reuse())::ECtx, r, rCtx))
  ++n
  apply(
  Reuse({(g-n): mapUpHere(E2p, Offset(n), Up(g))}),
    apply(E1s, r, rCtx),
    apply((Offset(n), Concat(n, E1f, E1s), Reuse())::ECtx, r, rCtx))
= apply(E1f, r, rCtx)[
  f ->
    apply(
      mapUpHere(E2m, Offset(0, n), Up(f)),
    apply(E1f, r, rCtx)[f],
    (f, apply(E1f, r, rCtx))::apply((Offset(0, n), Concat(n, E1f, E1s), Reuse())::ECtx, r, rCtx))
] ++n apply(E1s, r, rCtx)[
  (g - n) ->
  apply(
  mapUpHere(E2p, Offset(n), Up(g)),
    apply(E1s, r, rCtx)[g-n],
    (g-n, apply(E1s, r, rCtx))::apply((Offset(n), Concat(n, E1f, E1s), Reuse())::ECtx, r, rCtx))
]
= apply(E1f, r, rCtx)[
  f ->
    apply(
      mapUpHere(E2m, Offset(0, n), Up(f)),
    apply(E1f, r, rCtx)[f],
    (f-0, (apply(E1f, r, rCtx) ++n apply(E1s, r, rCtx))[0, n])::apply((Offset(0, n), Concat(n, E1f, E1s), Reuse())::ECtx, r, rCtx))
] ++n apply(E1s, r, rCtx)[
  (g - n) ->
  apply(
  mapUpHere(E2p, Offset(n), Up(g)),
    apply(E1s, r, rCtx)[g-n],
    (g-n, (apply(E1f, r, rCtx) ++n apply(E1s, r, rCtx)[n...])::apply((Offset(n), Concat(n, E1f, E1s), Reuse())::ECtx, r, rCtx))
]
= apply(E1f, r, rCtx)[
  f ->
    apply(
      mapUpHere(E2m, Offset(0, n), Up(f)),
    apply(E1f, r, rCtx)[f],
    (f-0, (apply(Concat(n, E1f, E1s), r, rCtx))[0, n])::(Offset(0, n), apply(Concat(n, E1f, E1s), r, rCtx))::apply(ECtx, r, rCtx))
] ++n apply(E1s, r, rCtx)[
  (g - n) ->
  apply(
  mapUpHere(E2p, Offset(n), Up(g)),
    apply(E1s, r, rCtx)[g-n],
    (g-n, (apply(Concat(n, E1f, E1s), r, rCtx))[n...])::(Offset(n), apply(Concat(n, E1f, E1s), r, rCtx))::apply(ECtx, r, rCtx))
] -- Use of MAPUPHERE below
= apply(E1f, r, rCtx)[
  f ->
    apply(E2m, apply(E1f, r, rCtx)[f], (f, apply(Concat(n, E1f, E1s), r, rCtx))::apply(ECtx, r, rCtx))
] ++n apply(E1s, r, rCtx)[
  (g - n) ->
  apply(E2p, g, (g, apply(Concat(n, E1f, E1s), r, rCtx))::apply(ECtx, r, rCtx))]
  = apply(E1f, r, rCtx)[
    f -> apply(E2m, apply(E1f, r, rCtx)[f], (f, (apply(E1f, r, rCtx) ++n apply(E1s, r, rCtx)))::apply(ECtx, r, rCtx))] ++n apply(E1s, r, rCtx)[
    g-n -> apply(E2p, apply(E1s, r, rCtx)[g-n], (g, (apply(E1f, r, rCtx) ++n apply(E1s, r, rCtx)))::apply(ECtx, r, rCtx))]
  = (apply(E1f, r, rCtx) ++n apply(E1s, r, rCtx))[
    f -> apply(E2m, apply(E1f, r, rCtx)[f], (f, (apply(E1f, r, rCtx) ++n apply(E1s, r, rCtx)))::apply(ECtx, r, rCtx))
    g -> apply(E2p, apply(E1s, r, rCtx)[g-n], (g, (apply(E1f, r, rCtx) ++n apply(E1s, r, rCtx)))::apply(ECtx, r, rCtx))
  ]
  = (apply(E1f, r, rCtx) ++n apply(E1s, r, rCtx))[
    f -> apply(E2m, (apply(E1f, r, rCtx) ++n apply(E1s, r, rCtx))[f], (f, (apply(E1f, r, rCtx) ++n apply(E1s, r, rCtx)))::apply(ECtx, r, rCtx))
    g -> apply(E2p, (apply(E1f, r, rCtx) ++n apply(E1s, r, rCtx))[g], (g, (apply(E1f, r, rCtx) ++n apply(E1s, r, rCtx)))::apply(ECtx, r, rCtx))
  ]
  = apply(Reuse({f: E2m, g: E2p}), apply(E1f, r, rCtx) ++n apply(E1s, r, rCtx), apply(ECtx, r, rCtx))
  = apply(Reuse({f: E2m, g: E2p}), apply(Concat(n, E1f, E1s), r, rCtx),      apply(ECtx, r, rCtx))
  QED;
        */
        
        let leftChildren = {};
        let rightChildren = {};
        forEachChild(secondAction, (secondChild, k) => {
          if(k < firstAction.count) {
            leftChildren[k] = Down(k, mapUpHere(Up(k, secondChild), Offset(0, firstAction.count), Up(k)));
          } else {
            rightChildren[k - firstAction.count] = Down(k - firstAction.count, mapUpHere(Up(k, secondChild), Offset(firstAction.count), Up(k)));
          }
        })
        
        if(editActions.__debug) {
          console.log("Inside left of Concat(" + firstAction.count, ", |, ...)");
        }
        let newFirst = recurse(New(leftChildren, ExtendModel()), firstAction.first, AddContext(Offset(0, firstAction.count), firstActionOriginal, firstActionContext));
        if(editActions.__debug) {
          console.log("Inside right of Concat(" + firstAction.count, ", ..., |)");
        }
        let newSecond = recurse(New(rightChildren, ExtendModel()), firstAction.second, AddContext(Offset(firstAction.count), firstActionOriginal, firstActionContext));
        
        return Concat(firstAction.count, newFirst, newSecond, firstAction.replaceCount, firstAction.firstReuse, firstAction.secondReuse);
      } else {
        // Anything else, we could use Sequence that transforms into Custom.
        /** Proof 
          applyZ(andThen(E2, E1, ECtx), rrCtx)
          = applyZ(Custom(E1, ((x, rrCtx) => apply(E2, x, apply(ECtx, rrCtx)), ?Rev))), rrCtx)
          = ((x, xrrCtx) => apply(E2, x, apply(ECtx, xrrCtx)))(
            applyZ(E1, rrCtx),
            rrCtx)
          = apply(E2, applyZ(E1, rrCtx), apply(ECtx, rrCtx)))
          QED;
        */ 
        // However, it does not reduce the size of the expression, really.
        return Sequence(firstActionOriginal, secondActionOriginal, firstActionContext);
      }
      // firstAction is Reuse, New, Custom, Concat or UseResult
      // secondAction is New, or UseResult
    } else if(secondAction.ctor == Type.New) {
      
      /**
         apply(andThen(New({f: E2}), E1, ECtx), r, rCtx)
         = apply(New({f: andThen(E2, E1, ECtx)}), r, rCtx)
         = {f: apply(andThen(E2, E1, ECtx), r, rCtx)}
         = {f: apply(E2, apply(E1, r, rCtx), apply(ECtx, r, rCtx)) }
         = apply(New({f: E2}), apply(E1, r, rCtx), apply(ECtx, r, rCtx)) -- GOAL
         
      */
      
      let newChildren = {};
      let notFirst = 0;
      for(let g in secondAction.childEditActions) {
        if(editActions.__debug) {
          console.log((notFirst ? "Back i" : notFirst++ || "I")+"nside New({ "+g+":... })");
        }
        newChildren[g] = recurse(secondAction.childEditActions[g], firstActionOriginal, firstActionContext);
      }
      return rawIfPossible(New(newChildren, secondAction.model), isSecondRaw);
      // firstAction is Reuse, New, Custom, Concat or UseResult
      // secondAction is UseResult
    }
    
    // Fallback and base case. Happens only if secondAction is UseResult
    /** Proof
         = apply(andThen(E1, E0, E0Ctx), r, rCtx);
         = apply(Sequence(E0, E1, E0Ctx), r, rCtx);
         = apply(E1, apply(E0, r, rCtx), apply(E0Ctx, r, rCtx))
         QED;
    */      
    return Sequence(firstActionOriginal, secondActionOriginal, firstActionContext);
  }
  editActions.andThen = andThenWithLog//andThen;
  
  // Assumes that the most recent relative path is Reuse()
  // Specification: (proof inline)
  // applyZ(E2, applyZip(walkUpActionCtx(k, EECtx), rrCtx))
  // = applyZ(Up(k, E2), applyZip(EECtx, rrCtx))
  function walkUpActionCtx(upKeyOrOffset, E1, ECtx) {
    if(ECtx === undefined) {
      console.trace("Error empty context for Up in walkUpActionCtx("+keyOrOffsetToString(upKeyOrOffset)+", "+stringOf(E1)+", undefined)");
    }
    let {hd: {keyOrOffset: keyOrOffset, prog: newFirstAction}, tl: newFirstActionContext} = ECtx;
    // Normally we should go up an offset.
    if(isOffset(upKeyOrOffset)) {
       if(isKey(keyOrOffset)) {
        console.trace("/!\\ Warning, going up with offset " + keyOrOffsetToString(upKeyOrOffset) + " but ctx started with key " + keyOrOffsetToString(keyOrOffset));
        return [E1, ECtx];
      }
      /** Proof:
       applyZ(E2, applyZip(walkUpActionCtx(Offset(c, n, o), E1, (Offset(c1, n1), E0, Reuse())::E2Ctx), rrCtx))
       = applyZ(E2, applyZip((offsetAt(Offset(c1-c, o), E0), (Offset(c1-c, o), E0, Reuse())::E2Ctx), rrCtx))
       = apply(E2, applyZ(offsetAt(Offset(c1-c, o), E0), rrCtx), applyCtxZ((Offset(c1-c, o), E0, Reuse())::E2Ctx, rrCtx))
       = apply(E2, applyOffset(Offset(c1-c, o), applyZ(E0, rrCtx)), (Offset(c1-c, o), applyZ(E0, rrCtx))::applyCtxZ(E2Ctx, rrCtx))
       = apply(Up(Offset(c, n, o), E2), applyZ(E1, rrCtx), (Offset(c1, n1), applyZ(E0, rrCtx))::applyCtxZ(E2Ctx, rrCtx))
       = apply(Up(Offset(c, n, o), E2), applyZ(E1, rrCtx), applyCtxZ((Offset(c1, n1), E0, Reuse())::E2Ctx, rrCtx))
       = applyZ(Up(Offset(c, n, o), E2), applyZip((E1, (Offset(c1, n1), E0, Reuse())::E2Ctx), rrCtx))
       QED;
      */
      let newUpOffset = downUpOffsetReturnsUp(keyOrOffset, upKeyOrOffset);
      let newDownOffset = upToDownOffset(newUpOffset);
      if(!newDownOffset) {
        // newUpOffset contains what we need to go up further. This is what we can return!
        return [newFirstAction, newFirstActionContext, newUpOffset];
      }
      return [
        offsetAt(newDownOffset, newFirstAction, false), 
        AddContext(newDownOffset, newFirstAction, newFirstActionContext)];
    }
    // isKey(upKeyOrOffset)
    if(isOffset(keyOrOffset)) { // We just skip it.
      return [newFirstAction, newFirstActionContext, upKeyOrOffset];
    }
    if(upKeyOrOffset != keyOrOffset) {
      console.log("/!\\ Warning, going up " + upKeyOrOffset + " after a down " + keyOrOffset + " in walkUpActionCtx");
    }
    /**Proof
      applyZ(E2, applyZip(walkUpActionCtx(k, EECtx), rrCtx))
      = applyZ(E2, applyZip(walkUpActionCtx(k, (E, (k, E0, Reuse())::ECtx)), rrCtx))
      = applyZ(E2, applyZip((E0, ECtx), rrCtx))
      = apply(E2, applyZ(E0, rrCtx), applyCtxZ(ECtx, rrCtx))
      = apply(Up(k, E2), applyZ(E, rrCtx), (k, applyZ(E0, rrCtx))::applyCtxZ(ECtx, rrCtx))
      = apply(Up(k, E2), applyZ(E, rrCtx), applyCtxZ((k, E0, Reuse())::ECtx, rrCtx))
      = applyZ(Up(k, E2), applyZip((E, (k, E0, Reuse())::ECtx, rrCtx))
      = applyZ(Up(k, E2), applyZip(EECtx, rrCtx))
      QED;
    */
    return [newFirstAction, newFirstActionContext];
  }
  
  
  // Invariant:
  // applyZ(E2, applyZip(walkDownActionCtx(keyOrOffset, E1, ECtx, Reuse()), rrCtx))
  // = applyZ(Down(f, E2), applyZip((E1, ECtx), rrCtx))
  function walkDownActionCtx(keyOrOffset, E1, ECtx, isRemove) {
    // RelativePath is Reuse() if we walk down keyOrOffset because of a 
    let newAction;
    if(isOffset(keyOrOffset)) {
      /** Proof:
        applyZ(E2, applyZip(walkDownActionCtx(offset, E1, ECtx, Reuse()), rrCtx))
        = applyZ(E2, applyZip((offsetAt(offset E1), (offset, E1, Reuse())::ECtx), rrCtx))
        = apply(E2, applyZ(offsetAt(offset, E1), rrCtx), applyCtxZ((offset, E1, Reuse())::ECtx, rrCtx))
        = apply(E2, applyOffset(offset, applyZ(E1, rrCtx)), (offset, applyZ(E1, rrCtx))::applyCtxZ(ECtx, rrCtx))
        = apply(Down(offset, E2), applyZ(E1, rrCtx), applyCtxZ(ECtx, rrCtx))
        = applyZ(Down(offset, E2), applyZip((E1, ECtx), rrCtx))
        QED
      */
      newAction = offsetAt(keyOrOffset, E1, isRemove);
    } else {
      /** Proof:
        applyZ(E2, applyZip(walkDownActionCtx(key, E1, ECtx, Reuse()), rrCtx))
        = applyZ(E2, applyZip((downAt(key E1), (key, E1, Reuse())::ECtx), rrCtx))
        = apply(E2, applyZ(downAt(key, E1), rrCtx), applyCtxZ((key, E1, Reuse())::ECtx, rrCtx))
        = apply(E2, applyZ(E1, rrCtx)[key], (key, applyZ(E1, rrCtx))::applyCtxZ(ECtx, rrCtx))
        = apply(Down(key, E2), applyZ(E1, rrCtx), applyCtxZ(ECtx, rrCtx))
        = applyZ(Down(key, E2), applyZip((E1, ECtx), rrCtx))
        QED
      */
      newAction = downAt(keyOrOffset, E1);
    }
    if(newAction === undefined) return undefined;
    return [newAction, AddContext(keyOrOffset, E1, ECtx)];
  }
  
  // apply(downAt(f, E1), r, rCtx)
  // = apply(E1, r, rCtx)[f]
  function downAt(key, editAction) {
    if(!isEditAction(editAction)) editAction = New(editAction);
    switch(editAction.ctor) {
    case Type.New:
      /** Proof: For New
        apply(downAt(f, New({f: E1})), r, rCtx)
        = apply(E1, r, rCtx)
        = {f: apply(E1, r, rCtx)}[f]
        = apply(New({f: E1}), r, rCtx)[f]
        
        For copy and keys that don't exist
        apply(downAt(f, NewC{}, r, rCtx)
        = apply(Down(f), r, rCtx)
        = r[f]
        = apply(NewC{}, r, rCtx)[f]
      */
      return key in editAction.childEditActions ? editAction.childEditActions[key]  :
      editAction.model.ctor == TypeNewModel.Extend ? Down(key) : New(undefined);
    case Type.Concat:
      /** Proof:
          Assuming f < n
          apply(downAt(f, Concat(n, E1, E2)), r, rCtx)
          = apply(downAt(f, E1), r, rCtx)
          = apply(E1, r, rCtx)[f]
          = (apply(E1, r, rCtx) ++n apply(E2, r, rCtx))[f]
          = apply(Concat(n, E1, E2), r, rCtx)[f]
          QED
          
          Assuming f >= n
          apply(downAt(f, Concat(n, E1, E2)), r, rCtx)
          = apply(downAt(f-n, E2), r, rCtx)
          = apply(E2, r, rCtx)[f-n]
          = (apply(E1, r, rCtx) ++n apply(E2, r, rCtx))[f]
          = apply(Concat(n, E1, E2), r, rCtx)[f]
          QED
          */
      return Number(key) < editAction.count ? downAt(key, editAction.first) : downAt(Number(key) - editAction.count, editAction.second);
    case Type.Up:
      /** Proof for keys
        apply(downAt(f, Up(k, E)), r[k], (k, r)::rCtx)
        = apply(Up(k, downAt(f, E)), r[k], (k, r)::rCtx)
        = apply(downAt(f, E), r, rCtx)
        = apply(E, r, rCtx)[f]
        = apply(Up(k, E), r[k], (k, r)::rCtx)[f]
        QED;
        
        and for offsets:
        
        apply(downAt(f, Up(Offset(c', n, o))), r[c..c+n], (Offset(c, n), r)::rCtx)
        = apply(Up(Offset(c', n, o), downAt(f, E)), r[c..c+n], (Offset(c, n), r)::rCtx)
        = apply(downAt(f, E), r[c-c'...c-c'+o], (Offset(c-c', o), r)::rCtx)
        = apply(E, r[c-c'...c-c'+o], (Offset(c-c', o), r)::rCtx)[f]
        = apply(Up(Offset(c', n, o), E), r[c..c+n], (Offset(c, n), r)::rCtx)[f]
      */
      return Up(editAction.keyOrOffset, downAt(key, editAction.subAction));
    case Type.Down:
      return Down(editAction.keyOrOffset, downAt(key, editAction.subAction));
    case Type.Clone:
      return Clone(downAt(key, editAction.subAction));
    default:
      /**Proof:
          apply(downAt(f, C), r, rCtx)
        = apply(Custom(Custom(X, lens), {apply(x) = x[f]}), r, rCtx)
        = (x => x[f])(apply(Custom(X, lens), r, rCtx))
        = apply(C, r, rCtx)[f]
        
      */
      // Wrap the edit action with a custom lens.
      return Custom(editAction, {
        apply: function(x) {
          return applyKey(key, x);
        },
        update: function(editOnKey) {
          return Reuse({[key]: editOnKey});
        },
        name: "applyKey("+keyOrOffsetToString(key)+", _)"
      })
    }
  }
  
  // A zip is a pair of an record and its context,
  // An action zip is a pair of an edit action and its context.
  function Zip(elem, ctx) {
    return {elem, ctx};
  }
  
  // applyZ(E, (r, rCtx)) == apply(E, r, rCtx)
  function applyZ(action, recordZip) {
    return apply(action, recordZip.elem, recordZip.ctx);
  }
  /** Lemma A:
      applyZ(E, applyZip((E1, E1Ctx), rrCtx))
    = applyZ(andThenZ(E, (E1, E1Ctx)), rrCtx)
  
     Proof:
      applyZ(E, applyZip((E1, E1Ctx), rrCtx))
    = applyZ(E, (applyZ(E1, rrCtx), applyCtxZ(E1Ctx, rrCtx)))
    = apply(E, apply(E1, r, rCtx), apply(E1Ctx, r, rCtx))
    = apply(andThen(E, E1, E1Ctx), r, rCtx)
    = applyZ(andThenZ(E, (E1, E1Ctx)), rrCtx)
    QED
  */
  
  // applyCtxZ(ECtx, (r, rCtx)) = apply(ECtx, r, rCtx);
  function applyCtxZ(actionContext, recordZip) {
    return apply(actionContext, recordZip.elem, recordZip.ctx);
  }
  
  // applyZip((E1, ECtx), (r, rCtx))
  //= (applyZ(E1, (r, rCtx)), applyCtxZ(ECtx, (r, rCtx)))
  function applyZip(actionZip, recordZip) {
    return Zip(
      applyZ(actionZip.elem, recordZip),
      applyCtxZ(actionZip.ctx, recordZip));
  }
  
  // andThenZ(E2, (E1, ECtx)) = andThen(E2, E1, ECtx)
  function andThenZ(action, actionZip) {
    return andThen(action, actionZip.elem, actionZip.ctx);
  }

  // Change all the fields of an object.
  // If fields are unchanged, guarantees to return te same object.
  function mapChildren(object, callback, canReuse = true, filter = undefined) {
    let t = treeOpsOf(object);
    let o = t.init();
    let same = canReuse;
    forEach(object, (child, k) => {
      let newOk = callback(k, t.access(object, k));
      if(filter && filter(newOk, k) === false) { same = false; return; }
      same = same && newOk === object[k];
      t.update(o, k, newOk);
    });    
    if(same) return object;
    return o;
  }
  editActions.mapChildren = mapChildren;
  
  /** Lemma: apply(E, R, lCtx ++ (Offset(c, a), r[d..d+b])::(Offset(d, b), r)::rCtx)
          == apply(E, R, lCtx ++ (Offset(c+d, a), r)::rCtx)
         for any a, b, c, d such that a <= b-c and a <= d
      Meaning: offsets are "idempotent".
      
      Proof: On the size of E.
      If E is a Reuse(), this is obviously true.
      If E = Reuse({f: Ef, g: Eg})
          apply(E, R, lCtx ++ (Offset(c+d, a), r)::rCtx)
        = R[f => apply(EF, R[f], (f, R)::lCtx ++ (Offset(c+d, a), r)::rCtx),
            g => apply(EF, R[g], (g, R)::lCtx ++ (Offset(c+d, a), r)::rCtx)]
        = R[f => apply(EF, R[f], (f, R)::lCtx ++ (Offset(c, a), r[d..d+b])::(Offset(d, b), r)::rCtx),
            g => apply(EF, R[g], (g, R)::lCtx ++ (Offset(c, a), r[d..d+b])::(Offset(d, b), r)::rCtx)]
        = apply(E, R, lCtx ++ apply(E, R, lCtx ++ (Offset(c, a), r[d..d+b])::(Offset(d, b), r)::rCtx)
      ok;
      A very similar proof can be done for Concat, New and Down (except they don't increase the context).
      Let's examine the Up case. The only discrepancy can happen if lCtx is empty. Let's assume lCtx is empty.
      Let's assume E = Up(Offset(x, _, m), E')
      If x <= c+d and m <= a, then let's examine the branch when x > c or m  > a:
      
        apply(Up(Offset(x, _, m), E'), R, (Offset(c+d, a), r)::rCtx)
      = apply(E', r[c+d-x..c+d-x+m], (Offset(c+d-x, m), r)::rCtx)
      On one side, and
        apply(Up(Ofset(x, _, m), E'), R, (Offset(c, a), r[d..d+b])::(Offset(d, b), r)::rCtx)
      = apply(Up(Offset(x-c, _, m), E'), r[d..d+b], (Offset(d, b), r)::rCtx)
      = apply(E', r[d-(x-c)..d-(x-c)+m], (Offset(d-(x-c), m), r)::rCtx)
      On the other side. Looking more closely, the two expressions are equal.
      When x <= c AND m <= a, we get on the other side:
        apply(Up(Offset(x, _, m), E'), R, (Offset(c, a), r[d..d+b])::(Offset(d, b), r)::rCtx)
      = apply(E', r[d+(c-x)..d+(c-x)+m], (Offset(c-x, m), r[d..d+b])::(Offset(d, b), r)::rCtx)
        by induction
      = apply(E', r[d+(c-x)..d+(c-x)+m], (Offset(d+c-x, m), r)::rCtx)
      which is again the same.
      QED.
  */
  
  // Assume editAction is neither Reuse, Replace, Prepend, Append, or Down with an offset.
  function makeOffsetInCompatibleAt(offset, editAction, originalOutCount, originalInCount) {
    printDebug("makeOffsetInCompatibleAt", offset, editAction, originalOutCount, originalInCount);
    // Do we need this if the second case works?
    originalOutCount = originalOutCount !== undefined ? originalOutCount : outLength(editAction);
    if(originalOutCount !== undefined) return Prepend(originalOutCount, editAction, originalInCount === 0 ? Reuse() : RemoveAll());
    // We don't know the length of the original out count. We use Append instead
    return Append(0, originalInCount === 0 ? Reuse() : RemoveAll(), editAction);
  }
  
  
  // State machine to avoid stack overflows.
  // Places all the computation in a stack machine and a while loop.
  /*
  function fib(n) {
    if(n <= 1) return n;
    return fib(n-1) + fib(n-2);
  }
  becomes.
  function fib(n) {
    var sm = new StateMachine();
    sm.compute(n); // Sets the initial computation
    sm.execute(n => { // Explains how to compute every element.
      // Returning something not undefined sets it as the result of the computation.
      // If you really need to return undefined, use return sm._doReturn(undefined);
      if(n <= 1) return n;
      
      // Puts the computation of the function on n-1 as the next thing to compute.
      // Accepts a callback on what to do with the result, with the original arguments as the second argument if needed.
      return sm.compute(n-1)((result1, n) => {
        // The body of a callback is the same as the body in execute.
        return sm.compute(n-2)((result2, n) => {
          return result1 + result2;
        });
      });
    });
    // At the end, to recover the value of the computation, just use .getValue().
    return sm.getValue();
  }
  
  You can even simplify:
  function fib(n) {
    var sm = new StateMachine();
    sm.compute(n);
    sm.execute(n => 
      n <= 1 ? n : 
      sm.compute(n-1)(result1 => 
        sm.compute(n-2)(result2 => 
          result1 + result2
        )
      )
    );
    return sm.getValue();
  }
  
  */  
  class StateMachine {
    constructor(args) {
      this.state = {ctor: "computation", args: args};
      this.stack = undefined;
      // Plug-in.
      this.onWhileStart = undefined;
    }
    // Provide an object whose keys are the argument names.
    // Optionally chain a callback on the resulting value and the saved arguments.
    compute(args) {
      var prevArgs = this.state.args;
      this.state = {ctor: "computation", args: args};
      return prevArgs == undefined ? undefined :
        callbackWithResultAndArgs => {
        if(callbackWithResultAndArgs !== undefined) {
          this.stack = {head: callbackWithResultAndArgs, args: prevArgs, tail: this.stack};
        }
      };
    }
    // Needs the state to be a result
    getValue() {
      return this.state.value;
    }
    execute(body) {
      while(this._isNotFinished()) {
        if(this.onWhileStart != undefined) this.onWhileStart(this);
        if(this._isResult()) {
          this._handleResult();
          continue;
        }
        var toReturn = body(this._getArgs());
        if(toReturn !== undefined && typeof toReturn != "function") {
          this._doReturn(toReturn);
        }
      }
    }
    // Needs the state to be a computation.
    _getArgs() {
      return this.state.args;
    }
    _isResult() {
      return this.state.ctor == "result";
    }
    // Requires the stack to be not empty and the state to be a result
    _handleResult() {
      var head = this.stack.head;
      var args = this.stack.args;
      this.stack = this.stack.tail;
      var value = this.state.value;
      // Restore the computation.
      this.state = {ctor: "computation", args: args};
      var toReturn = head(value, args);
      if(toReturn !== undefined && typeof toReturn != "function") {
        this._doReturn(toReturn);
      }
    }
    _doReturn(x) {
      this.state = {ctor: "result", value: x};
    }
    // For the while loop.
    _isNotFinished() {
      if(this.state == undefined) throw new Exception("Uninitialized state machine. Call compute() at least once.");
      return this.state.ctor != "result" || this.stack !== undefined;
    }
  }
  
  // If e = offsetIn(offset, editAction)
  // Then, for some X and Y
  // apply(editAction, r, rCtx) =
  // apply(Down(before(offset), x), r, rctx) ++ apply(Down(offset, e), r, rCtx) ++ apply(Down(after(offset), Y), r, rCtx)
  
  // [newEdit, count] = offsetIn(offset, editAction)
  // Property:
  //   If [left, ol] = offsetIn(Offset(0, i), editAction)
  //   and [right, or] = offsetIn(Offset(i), editAction)
  //   then apply(Replace(i, ol, left, right), r, rCtx) == apply(editAction, r, rCtx)
  // the edit action offsetIn(offset, editAction)[1] will always be executed in the context of the offset.
  // Hence, if the offset specifies a newLength, the result does not need to re-specify this length.
  function offsetIn(offset, editAction, defaultIsReuse = false, recoveryMode = true, originalOutCount = undefined) {
    var sm = new StateMachine();
    if(editActions.__debug) {
      sm.onWhileStart = sm => printDebug("State:", sm.state, "\nstack:", sm.stack);
    }
    function offsetInAux(offset, editAction, originalOutCount = undefined, originalInCount = undefined) {
      return sm.compute({offset, editAction, originalOutCount, originalInCount});
    }
    offsetInAux(offset, editAction, originalOutCount);
    sm.execute(({offset, editAction, originalOutCount, originalInCount}) => {
      printDebug("offsetIn"+(originalOutCount === undefined ? "" : " (originalOutCount = " + originalOutCount +")")+(originalInCount === undefined ? "" : " (originalInCount = " + originalInCount +")"), offset, editAction);
      let {count: n, newLength, oldLength} = offset;
      if(n == 0 && newLength === undefined) {
        /* Outdated Proof:
              apply(Replace(0, 0, Reuse(), editAction), r, rCtx)
            = apply(Down(Offset(0, 0)), r, rCtx) ++0 apply(Down(Offset(0), editAction), r, rCtx)
            = [] ++0 apply(editAction, r, rCtx)
            = apply(editAction, r, rCtx)
            QED
        */
        return [editAction, undefined];
      }
      
      function doDefault() {
        if(defaultIsReuse) return ([Reuse(), originalOutCount]);
        else if(recoveryMode) return offsetInAux(offset, makeOffsetInCompatibleAt(offset, editAction, originalOutCount, originalInCount), originalOutCount, originalInCount);
        else return (Up(offset, editAction));
      }
      
      let [inCount, outCount, left, right] = argumentsIfReplace(editAction);
      if(right !== undefined) {
        if(inCount <= n && inCount > 0) {
          /* Outdated Proof:
              apply(editAction, r, rCtx)
            = apply(Replace(i, o, L, R), r, rCtx)
            = apply(Down(Offset(0, i), L), r, rCtx) ++o apply(Down(Offset(i), R), r, rCtx)
            = apply(Down(Offset(0, i), L), r, rCtx) ++o apply(R, r[i...], (Offset(i), r)::rCtx)
            = apply(Down(Offset(0, i), L), r, rCtx) ++o apply(Replace(n-i, o2, r1, r2), r[i...], (Offset(i), r)::rCtx)
            = apply(Down(Offset(0, i), L), r, rCtx) ++o (apply(Down(Offset(0, n-i), r1), r[i...], (Offset(i), r)::rCtx) ++o2 apply(Down(Offset(n-i), r2), r[i...], (Offset(i), r)::rCtx))
            = (apply(Down(Offset(0, i), L), r, rCtx) ++o apply(Down(Offset(0, n-i), r1), r[i...], (Offset(i), r)::rCtx)) ++(o+o2) apply(Down(Offset(n-i), r2), r[i...], (Offset(i), r)::rCtx)
            = (apply(Down(Offset(0, i), L), r, rCtx) ++o apply(r1, r[i...i+(n-i)], (Offset(0, n-i), r[i...])::(Offset(i), r)::rCtx)) ++(o+o2) apply(Down(Offset(n-i), r2), r[i...], (Offset(i), r)::rCtx)
            = (apply(Down(Offset(0, i), L), r, rCtx) ++o apply(Down(Offset(i, n-i), r1), r, rCtx))) ++(o+o2) apply(Down(Offset(n), r2), r, rCtx)
            = (apply(Down(Offset(0, i), L), r[0..n], (Offset(0, n), r)::rCtx) ++o apply(Down(Offset(i), L), r1), r[0..n], (Offset(0, n), r)::rCtx)) ++(o+o2) apply(Down(Offset(n), r2), r, rCtx)
            = (apply(Replace(i, o, L, r1), r[0..n], (Offset(0, n), r)::rCtx) ++(o+o2) apply(Down(Offset(n), r2), r, rCtx)
            = (apply(Down(Offset(0, n), Replace(i, o, L, r1)), r, rCtx) ++(o+o2) apply(Down(Offset(n), r2), r, rCtx)
            = apply(Replace(n, o+o2, Replace(i, o, L, r1), r2)
            QED;
        */
          return offsetInAux(Offset(n-inCount, newLength), right, MinusUndefined(originalOutCount, outCount), MinusUndefined(originalInCount, inCount));
        } else if(newLength !== undefined && n + newLength <= inCount) {
          return offsetInAux(offset, left, outCount, inCount);
        } else { // Hybrid. n < inCount and (newLength === undefined || n + newLength > inCount)
          return offsetInAux(Offset(n, inCount-n), left, outCount, inCount)(
            ([newLeft, newLeftCount]) => {
            if(newLeft === undefined) { return []; } // recovery mode works at the leaves.
            else {
            return offsetInAux(Offset(0, MinusUndefined(newLength, inCount-n)), right, MinusUndefined(originalOutCount, outCount), MinusUndefined(originalInCount, inCount))(
            ([newRight, newRightCount]) => {
              if(newRight === undefined) { return []; } // recovery mode works at the leaves.
              else {
              printDebug("returning Replace(", inCount-n, newLeftCount, newLeft, newRight);
              return [Replace(inCount - n, newLeftCount, newLeft, newRight), PlusUndefined(newLeftCount, newRightCount)];
          /* Outdated Proof:
                apply(editAction, r, rCtx)
              = apply(Replace(i, o, L, R), r, rCtx)
              = apply(Down(Offset(0, i), L), r, rCtx) ++o apply(Down(Offset(i), R), r, rCtx)
              = apply(L, r[0..i], (Offset(0, i), r)::rCtx) ++o apply(Down(Offset(i), R), r, rCtx)
              = apply(Replace(n, o2, l1, l2), r[0..i], (Offset(0, i), r)::rCtx) ++o apply(Down(Offset(i), R), r, rCtx)
              = (apply(Down(Offset(0, n), l1), r[0..i], (Offset(0, i), r)::rCtx) ++o2 
                 apply(Down(Offset(n), l2), r[0..i], (Offset(0, i), r)::rCtx)) ++o
                apply(Down(Offset(i), R), r, rCtx)
              = apply(l1, r[0..n], (Offset(0, n), r)::rCtx) ++o2 
                 (apply(l2, r[n..i], (Offset(n, i-n), r)::rCtx) ++(o-o2)
                  apply(R, r[i...], (Offset(i), r)::rCtx))
                  
              = apply(l1, r[0..n], (Offset(0, n), r)::rCtx) ++o2 
                 (apply(Down(Offset(0, i-n), l2), r[n...], (Offset(n), r)::rCtx) ++(o-o2)
                  apply(Down(Offset(i-n), R), ..., (Offset(n), r)::rCtx))
              = apply(l1, r[0..n], (Offset(0, n), r)::rCtx) ++o2 
                 (apply(Replace(i-n, o-o2, l2, R), (Offset(n), r)::rCtx))
              = apply(Replace(n, o2, l1, Replace(i-n, o-o2, l2, R)), r, rCtx)
              QED;
          */
              }
            });
            }
          });
        }
      }
      if(isPrepend(editAction)) {
        return offsetInAux(offset, editAction.second, MinusUndefined(originalOutCount, editAction.count), originalInCount)(
          ([e2, o2]) => {
        if(e2 !== undefined) {
          if(n > 0) { // We don't keep the Prepend
            return [e2, o2];
          } else {
            let newPrepended = editAction.first;
            return [Prepend(editAction.count, newPrepended, e2), PlusUndefined(editAction.count, o2)];
          }
        } else {
          return doDefault();
        }
        });
      }
      if(isAppend(editAction)) {
        return offsetInAux(offset, editAction.first, editAction.count, originalInCount)(
          ([e2, o2]) => {
        if(e2 !== undefined) {
          printDebug("subAppend result", e2, o2);
          if(newLength !== undefined && originalInCount !== undefined && n + newLength < originalInCount) { // We don't keep the Append
            return [e2, o2];
          } else {
            return [Append(o2, e2, editAction.second), MinusUndefined(PlusUndefined(originalOutCount, o2), editAction.count)];
          }
        } else {
          return doDefault();
        }
        });
      }
      if(isReuse(editAction)) {
        // Let's generate a Replace to mimic the Reuse.
        /* Outdated Proof: Assume editAction = Reuse({f: Ef, g: Eg}) where f < n and g >= n
             apply(editAction, r, rCtx)
           = apply(Reuse({f: Ef, g: Eg}), r, rCtx)
           = r[f => apply(Ef, r[f], (f, r)::rCtx),
               g => apply(Eg, r[g], (g, r)::rCtx)]
           = r[0..n][f => apply(Ef, r[f], (f, r)::rCtx)] ++n
             r[n..][(g-n) => apply(Eg, r[g], (g, r)::rCtx)]
           = r[0..n][f => apply(mapUpHere(Ef, Offset(0, n), Up(f)), r[f], (f, r[0..n])::(Offset(0, n), r)::rCtx)] ++n
             r[n..][(g-n) => apply(mapUpHere(Eg, Offset(n), Up(g)), r[g], (g-n, r[n..])::(Offset(n), r)::rCtx)]
           = r[0..n][f => apply(mapUpHere(Ef, Offset(0, n), Up(f)), r[f], (f, r[0..n])::(Offset(0, n), r)::rCtx)] ++n
             r[n..][(g-n) => apply(mapUpHere(Eg, Offset(n), Up(g)), r[g], (g-n, r[n..])::(Offset(n), r)::rCtx)]
           = apply(Reuse({f: mapUpHere(Ef, Offset(0, n), Up(f))}), r[0..n], (Offset(0, n), r)::rCtx) ++n
             apply(Reuse({(g-n): mapUpHere(Eg, Offset(n), Up(g))}), r[n..], (Offset(n), r)::rCtx)
           = apply(Down(Offset(0, n), Reuse({f: mapUpHere(Ef, Offset(0, n), Up(f))})), r, rCtx) ++n
             apply(Down(Offset(n), Reuse({(g-n): mapUpHere(Eg, Offset(n), Up(g))})), r, rCtx)
           = apply(Replace(n, n, Reuse({f: mapUpHere(Ef, Offset(0, n), Up(f))}), Reuse({(g-n): mapUpHere(Eg, Offset(n), Up(g))})), r, rCtx)
           QED;
        */
        let remainingo = {};
        forEachChild(editAction, (child, k) => {
          if(k >= n && (newLength === undefined || k < n + newLength)) {
            remainingo[k-n] = Down(k-n, mapUpHere(Up(k, child), offset, Up(k)));
          }
        });
        return [New(remainingo, editAction.model), lengthOfArray(remainingo, newLength)];
      }
      if(isDown(editAction) && isOffset(editAction.keyOrOffset)) {
        // offset restriction.
        let {count: c, newLength: l, oldLength: o} = editAction.keyOrOffset;
        if(l !== undefined && c + l <= n || newLength !== undefined && n + newLength <= c) {
          // Disjoint input intervals.
          return [RemoveAll(PlusUndefined(c, l) === n ? editAction.subAction: Reuse()), 0];
        } else if(keyOrOffsetAreEqual(editAction.keyOrOffset, offset)) {
          return [editAction.subAction, originalOutCount];
        } else { // Something in the intersection.
          // 0    [n         n+newLength[
          // 0         [c                   c+l[
          //           [countFinal      [countFinal+newLengthFinal[
          // Here, need to prefix with Down(Offset(c-n)), and sub needs offsetIn(0, newLengthFinal)
          
          // 0        [n                          n+newLength[
          // 0   [c                      c+l[
          //          [countFinal           [countFinal+newLengthFinal
          // Here, no need to prefix, but sub needs to have offsetIn(n-c, newLengthFinal) 
          //   and it should be prefixed with an Offset()
          let {count: countFinal, newLength: newLengthFinal} = intersectOffsets(offset, editAction.keyOrOffset);
          let relativeOffset = Offset(n >= c ? n - c: 0, newLengthFinal);
          return offsetInAux(relativeOffset, editAction.subAction, originalOutCount, MinUndefined(MinusUndefined(originalInCount, c), l))(
          ([newSub, newSubCount]) => {
            return [SameDownAs(editAction)(Offset(n >= c ? 0 : c - n, LessThanUndefined(PlusUndefined(c, l), PlusUndefined(n, newLength)) ? newLengthFinal : undefined), newSub), newSubCount];
          });
        /* Outdated proof: Assume editAction = Down(Offset(c, l, o), E) where c >= n
           apply(editAction, r, rCtx)
         = apply(Down(Offset(c, l, o), E), r, rCtx);
         = apply(Down(Offset(0, n), Down(Offset(0, 0, n))), r, rCtx) ++0
           apply(Down(Offset(n), Down(Offset(c-n, l, o-n), E)), r, rCtx);
         = apply(Replace(n, 0, Down(Offset(0, 0, n)), Down(Offset(c-n, l, o-n), E)), r, rCtx)
         QED;
        */
        }
      }
      // TODO: Deal with Choose. Change offsetIn to a generator?
      /*if(editAction.ctor == Type.Choose) {
        // Return a Choose.
        return Choose(Collection.map(editAction.subActions, splitIn));
      }*/
      return doDefault();
    });
    printDebug("## offsetIn returns"+(originalOutCount === undefined ? "" : " (outCount = " + originalOutCount), offset, editAction, "=>", sm.getValue());
    return sm.getValue();
  }
  editActions.__offsetIn = offsetIn;
  
  // splitIn works only for any combination of Replace, Reuse and RemoveExcept
  // Replace(0, x, I, E) will also always work because
  //   if n == 0, then it will just return editAction.
  //   if n > 0, then inCount < n and thus, only right is split.
  // Hence splitIn works for Keep and the old version of Prepend as well!
  
  // If [outCount, left, right] = splitIn(inCount, editAction)
  // Then
  // apply(Replace(inCount, outCount, left, right), r, rCtx) = apply(editAction, r, rCtx)
  function splitIn(n, editAction, contextCount = undefined) {
    printDebug("splitIn", n, editAction);
    let [left, leftCount] = offsetIn(Offset(0, n), editAction, contextCount);
    let [right, rightCount] = offsetIn(Offset(n), editAction, contextCount);
    return [leftCount, left, right];
  }

  /**
    Invariant: if
      apply(editAction, [...key: x...], ctx)
    is defined, then
      apply(Down(key, keyOrOffsetIn(key, editAction)), r, rCtx)
    is defined too.
    
    For offsets, if
      apply(editAction, r1 ++c (r2 ++ l r3), ctx)
    is defined, then
      apply(Down(Offset(c, l), keyOrOffsetIn(Offset(c, l), editAction), r, rCtx)
    is defined too.
    
    It always returns something.
  */
  function keyOrOffsetIn(keyOrOffset, editAction, recoveryMode = true, originalOutCount = undefined) {
    if(isOffset(keyOrOffset)) return offsetIn(keyOrOffset, editAction, /*defaultIsReuse*/true, recoveryMode, originalOutCount)[0];
    return keyIn(keyOrOffset, editAction);
  }
  
  // What did key through edit action become?
  /**
    if
      apply(editAction, r, ctx)
    is defined, then
      apply(Down(key, keyOrOffsetIn(key, editAction)), r, rCtx)
    is defined too.
  */
  function keyIn(key, editAction) {
    printDebug("keyIn", key, editAction);
    if(isDown(editAction)) {
      if(isOffset(editAction.keyOrOffset)) {
        let {count, newLength, oldLength} = editAction.keyOrOffset;
        if(key < count) return Reuse();
        if(newLength !== undefined && key >= count + newLength) return Reuse(); // Default case, proof below
        let c = count;
        let l = newLength;
        let o = oldLength;
        let X = editAction.subAction;
        /** Proof
            apply(Down(Offset(c, l, o), X), r, rCtx) was defined.
            = apply(X, r[c..c+l], (Offset(c, l, o), r)::rCtx) was defined and key is in [c..c+l]

            By induction,
            
            apply(Down(key-c, keyIn(key-c, X)), r[c..c+l], (Offset(c, l, o), r)::rCtx) is defined,
            = apply(keyIn(key-c, X), r[key], (key-c, r[c..c+l])::(Offset(c, l, o), r)::rCtx) is defined,
            Let's apply mapUpHere with
              key-c = m.k
              Offset(c, l, o) == Offset(m.c, m.n, m.o)
            = apply(mapUpHere(keyIn(key-c, X), Offset(-m.c, m.o, m.n), Up(m.k+m.c)), r[key], (m.k+m.c, r)::rCtx)
            = apply(mapUpHere(keyIn(key-c, X), Offset(-c, o, l), Up(key)), r[key], (key, r)::rCtx)
            = apply(Down(key, mapUpHere(keyIn(key-c, X), Offset(-c, o, l), Up(key))), r, rCtx)
            = apply(Down(key, keyIn(key, Down(Offset(c, l, o), X))), r, rCtx) is defined
        */
        return keyIn(key-c, X);
      } else {
        if(key == editAction.keyOrOffset) {
          /** Proof:
              apply(Down(key, keyIn(key, editAction)), r, rCtx)
            = apply(Down(key, editAction.subAction), r, rCtx)
            = apply(editAction, r, rCtx)
            which is well defined.
          */
          return editAction.subAction;
        } else {
          return Reuse(); // Default case, we cannot do otherwise.
        }
      }
    }
    if(isReuse(editAction)) {
      /** Proof:
          apply(Reuse({key: E}), r, rCtx) =  [...key: apply(E, x, (key, r)::rCtx)...])

            apply(Down(key, keyIn(key, Reuse({key: E}))), r, rCtx)
          = apply(keyIn(key, Reuse({key: E})), x, (key, r)::rCtx)
          = apply(E, x, (key, r)::rCtx)
          QED;  it used to be defined.
      */
      return childIfReuse(editAction, key);
    } else if(isReplace(editAction)) {
      let [inCount, outCount, left, right] = argumentsIfReplace(editAction);
      if(inCount <= key) {
        /** Proof:
          apply(Concat(_, first, second), r, rCtx)
            is defined
         thus
           apply(first, r, rCtx) is defined,
           thus
           apply(KeyIn(key, first), r, rCtx) is defined.
           Same for second.
        */
        return keyIn(key, editAction.second);
      } else {
        return keyIn(key, editAction.first);
      }
    }
    /** Proof default case:
        apply(Down(key, KeyIn(key, X)), r, rCtx)
      = apply(Down(key, Up(key, X)), r, rCtx)
      = apply(X, r, rCtx)
      which is defined by supposition.
      QED;
    */
    return Reuse();
  }
  editActions.__keyIn = keyIn;

  // Specification:
  // apply(offsetAt(offset, EX), r, rCtx)
  // = applyOffset(offset, apply(EX, r, rCtx))
  function offsetAt(offset, editAction, isRemove) {
    var sm = new StateMachine();
    function offsetAtAux(offset, editAction, isRemove) {
      return sm.compute({offset, editAction, isRemove});
    }
    offsetAtAux(offset, editAction, isRemove);
    sm.execute(({offset, editAction, isRemove}) => {

    printDebug("offsetAt(", offset, "," , editAction, ",", isRemove, ")");
    if(isOffsetIdentity(offset)) {
      /** Proof:
        apply(offsetAt(Offset(0, n, n), EX), r, rCtx)
        = apply(EX, r, rCtx)
        = applyOffset(Offset(0, n, n), apply(EX, r, rCtx))
        QED;
      */
      return editAction;
    }
    var left, right;
    var wasRaw = false;
    if(!isEditAction(editAction)) {
      wasRaw = true;
      editAction = New(editAction);
    }
    var {count, newLength, oldLength} = offset;
    switch(editAction.ctor) {
    case Type.New:
      if(isReuse(editAction)) {
        // We cannot just shift keys because they have to exist in the original record.
        /** n = count
          Proof:
          editAction: Extend({f: Ef}) where f is in the offset, m and n are not
          
          apply(offsetAt(Offset(count, newLength), Extend({f: Ef})), r, rCtx)
          = apply(Down(offset, Extend({...(f-count): Down(f-count, mapUpHere(Up(f, Ef), Offset(count, newLength), Up(f))...}))), r, rCtx)
          = {...(f-count): apply(Down(f-count, mapUpHere(Up(f, Ef), Offset(count, newLength), Up(f))), r[Offset(count, newLength)], (Offset(count, newLength), r)::rCtx)...}
          = {...(f-count): apply(mapUpHere(Up(f, Ef), Offset(count, newLength), Up(f)), r[Offset(count, newLength)][f-count],
              (f-count, r[Offset(count, newLength)])::(Offset(count, newLength), r)::rCtx)...}
          = {...(f-count): apply(Up(f, Ef), r[f], (f, r)::rCtx)...}
          = {...(f-count): apply(Ef, r, rCtx)...}
          = applyOffset(Offset(count, newLength), {...f: apply(Ef, r, rCtx)...})
          = applyOffset(Offset(count, newLength), apply(Extend({f: Ef}), r, rCtx))
          QED;
        */
        var remaining = {};
        forEachChild(editAction, (child, g) => {
          if(g >= count && (newLength === undefined || g < count + newLength)) { // g >= count
            //remaining[g - count] = Up(g-count, Offset(count), Down(g, editAction.childEditActions[g]));
            remaining[g-count] = Down(g-count, mapUpHere(Up(g, child), offset, Up(g)));
          }
        });
        return SameDownAs(isRemove)(offset, New(remaining, editAction.model));
      } else if(typeof editAction.model.value === "string") {
        /** Proof
          editAction = New("abcdnef");
          
          apply(New("abcdn"), r, rCtx) ++n apply(New("ef"), r, rCtx)
          = "abcdn" + "ef"
          = "abcdnef"
          = apply(editAction, r, rCtx)
        */
        return rawIfPossible(New(editAction.model.value.substring(count, newLength !== undefined ? count + newLength : undefined)), wasRaw);
      } else {
        /** n = count
        Proof: (f < n, g >= n)
        editAction: New({...f: Ef ...g: Eg...})
        left: New({...f: Ef.})
        right: New({..g: Eg...})
        
        apply(left, r, rCtx) ++n apply(right, r, rCtx))
        = apply(New({...f: Ef.}), r, rCtx) ++n apply(New({.g: Eg...}), r, rCtx);
        = {...f: apply(EF, r, rCtx).} ++n {..(g-n):apply(Eg, r, rCtx)};
        = {...f: apply(EF, r, rCtx)...(g-n):apply(Eg, r, rCtx)};
        = apply(editAction, r, rCtx);
        QED
        */
        
        var remaining = {};
        forEachChild(editAction, (child, k) => {
          if(k >= count && (newLength === undefined || k < count + newLength)) {
            remaining[k - count] = child;
          }
        });
        var treeOps = treeOpsOf(editAction.model.value);
        var remainingModelValue = treeOps.init();
        forEach(editAction.model.value, (child, k) => {
          if(k >= count && (newLength === undefined || k < count + newLength)) {
            treeOps.update(remainingModelValue, k - count, child);
          }
        })
        // Proof: editAction = New({fi = ei}i, [])
        //                   = Concat(count, Down(Offset(0, count), New({fi = ei, if fi < count}i)), Down(Offset(count), New({(fi-count) = ei, if fi >= count})))
        return rawIfPossible(New(remaining, ConstModel(remainingModelValue)), wasRaw);
      }
    case Type.Concat:
      if(editAction.count == count) {
        /**
          Proof:
          editAction = Concat(n, E1, E2)
          left = E1
          right = E2
          
          apply(left, r, rCtx) ++n apply(right, r, rCtx)
          = apply(Concat(n, left, right), rCtx)
          = apply(editAction, r, rCtx);
        */
        return offsetAtAux(Offset(0, newLength), editAction.second, isRemove)(
        newRight => {
        if(count === 0) {
          // Include the first only if it had zero length.
          return Concat(editAction.count, editAction.first, newRight, editAction.replaceCount, editAction.firstReuse, editAction.secondReuse);
        } else {
          return newRight;
        }
        });
      } else if(editAction.count < count) { // We remove the left part.
        return offsetAtAux(Offset(count - editAction.count, newLength), editAction.second, isRemove);
      } else if(newLength !== undefined && count + newLength <= editAction.count) { // We remove the right part.
        return offsetAtAux(offset, editAction.first, isRemove);
      } else { // Hybrid. c < count && (n === undefined || c+n > count)
        let [keepCount, keepSub] = argumentsIfKeep(editAction);
        if(keepSub !== undefined && newLength === undefined && count < keepCount) {
          /** Proof:
            apply(offsetAt(Offset(c), Keep(c', sub)), r, rCtx)
            = apply(Remove(c, Keep(c'-c, sub)), r, rCtx)
            = apply(Keep(c'-c, sub), r[c,...], (Offset(c), r)::rCtx)
            = r[c..c'[ ++(c'-c) apply(sub, r[c', ...], (Offset(c'-c), r[c...])::(Offset(c), r)::rCtx)
            = r[c..c'] ++(c'-c) apply(sub, r[c'...], (Offset(c'), r):: rCtx))
            = applyOffset(Offset(c), r[0..c'] ++c' apply(sub, r[c'...], (Offset(c'), r):: rCtx))
            = applyOffset(Offset(c), apply(Keep(c', sub), r, rCtx))
          */
          return Remove(count, Keep(keepCount - count, keepSub));
        }
      
        /** Proof:
          apply(offsetAt(Offset(c, n), Concat(count, first, second)), r, rCtx)
          = apply(Concat(count-c, offsetAt(Offset(c, count-c), first), OffsetAt(Offset(0, n-count+c), second)), r, rCtx)
          = apply(offsetAt(Offset(c, count-c), first), r, rCtx) ++(count-c) apply(OffsetAt(Offset(0, n-count+c), second), r, rCtx))
          = applyOffset(Offset(c, count-c), apply(first, r, rCtx)) ++(count-c) applyOffset(Offset(0, n-count+c), apply(second, r, rCtx))
          = applyOffset(Offset(c, n), apply(first, r, rCtx) ++count apply(Concat(second, r, rCtx))
          = applyOffset(Offset(c, n), apply(Concat(count, first, second), r, rCtx))
        */
        return offsetAtAux(Offset(count, editAction.count - count), editAction.first, isRemove)(
        newFirst =>
              offsetAtAux(Offset(0, PlusUndefined(MinusUndefined(newLength, editAction.count), count)), editAction.second, isRemove)(
        newSecond =>
          Concat(editAction.count - count,
                 newFirst,
                 newSecond,
                 editAction.replaceCount, editAction.firstReuse, editAction.secondReuse)
        ));
      }
    case Type.Up:
      /** Proof
         apply(offsetAt(offset, Up(ko, E)), r, rCtx)
         = apply(Up(ko, offsetAt(offset, E)), r[ko], (ko, r')::rCtx)
         = apply(offsetAt(offset, E), r', rCtx))
         = applyOffset(offset, apply(E, r', rCtx))
         = applyOffset(offset, apply(Up(ko, E), r[ko], (ko, r')::rCtx))
      
      */
      return offsetAtAux(offset, editAction.subAction, isRemove)(
        newSubAction =>
        Up(editAction.keyOrOffset, newSubAction)
      );
    case Type.Down:
      return offsetAtAux(offset, editAction.subAction, isRemove)(
        newSubAction =>
          SameDownAs(editAction.isRemove || isRemove && isOffset(editAction.keyOrOffset))(editAction.keyOrOffset, newSubAction)
      );
    case Type.Choose:
      // Exceptionally for choose, we consume a stack element.
      return Choose(Collection.map(editAction.subActions, x => offsetAt(offset, x)));
    case Type.Clone:
      return offsetAtAux(offset, editAction.subAction)(
        result => Clone(result));
    default: // editAction.ctor == Custom
      /**Proof:
          apply(offsetAt(f, C), r, rCtx)
        = apply(Custom(C, {apply(x) = applyOffset(f, x)}), r, rCtx)
        = (x => applyOffset(offset, x))(apply(C, r, rCtx))
        = applyOffset(offset, apply(C, r, rCtx))
      */
      // Wrap the edit action with a custom lens.
      return Custom(editAction, {
        apply: function(x) {
          return applyOffset(offset, x);
        },
        update: function(editOnOffset) {
          return ReuseOffset(offset, editOnOffset);
        },
        name: "applyOffset("+keyOrOffsetToString(offset) + ", _)"});
      /**Proof:
        Assuming:
        left = Custom(editAction, {apply(x) = applyOffset(Offset(0, n), x)})
        right = Custom(editAction, {apply(x) = applyOffset(Offset(n), x)})
        
        apply(left, r, rCtx) ++n apply(right, r, rCtx)
        = apply(Custom(editAction, {apply(x) = applyOffset(Offset(0, n), x)}), r, rCtx)) ++n
          apply(Custom(editAction, {apply(x) = applyOffset(Offset(n), x)}), r, rCtx)
        = (applyOffset(Offset(0, n), .))(apply(editAction, r, rCtx)) ++n
          (applyOffset(Offset(n), .))(apply(editAction, r, rCtx))
        = apply(editAction, r, rCtx)
       
          apply(offsetAt(f, C), r, rCtx)
        = apply(Custom(C, {apply(x) = applyOffset(f, x)}), r, rCtx)
        = (x => applyOffset(offset, x))(apply(C, r, rCtx))
        = applyOffset(offset, apply(C, r, rCtx))
        QED.
      */
    }
    });
    return sm.getValue();
  }
  editActions.offsetAt = offsetAt;
  
  // Computes the intersection of two offsets.
  function intersectOffsets(offset1, offset2) {
    printDebug("intersectOffsets", offset1, offset2);
    let newCount = Math.min(offset1.count, offset2.count);
    let end1 = PlusUndefined(offset1.count, offset1.newLength);
    let end2 = PlusUndefined(offset2.count, offset2.newLength);
    let newStart = Math.max(offset1.count, offset2.count);
    let newEnd = MinUndefined(end1, end2);
    let result = Interval(MinUndefined(newStart, newEnd), newEnd);
    printDebug("intersectOffsets(", offset1, offset2, ")=", result);
    return result;
  }
  
  /** Proof:
      Down((cb, nb, ob), diffOffset((cb, nb, ob), (cs, ns, os)))
    = Down((cb, nb, ob), (cs-cb, ns, nb))    
    = Down((cs, ns, os))
  */
  // Down(biggerOffset, diffOffset(biggerOffset, smallerOffset)) = Down(smallerOffset)
  function diffOffset(biggerOffset, smallerOffset) {
    return Offset(smallerOffset.count - biggerOffset.count, smallerOffset.newLength, biggerOffset.newLength);
  }
  
  function isRemoveExcept(E2) {
    return typeof E2 == "object" && E2.ctor == Type.Down && E2.isRemove && isOffset(E2.keyOrOffset);
  }
  
  // Merge function, but with logs of outputs
  function addLogMerge(fun) {
    return function(E1, E2, ICtx1, ICtx2) {
      let res = fun(E1, E2, ICtx1, ICtx2);
      if(editActions.__debug) {
        printDebug("merge returns", E1, E2, "=>", res);
      }
      return res;
    }
  }
  
  // Impure code detected - Heuristic is to convert to remove/prepend
  // Spec A: returns an edit action that would produce the same result, just written differently.
  // apply(toSplitInCompatibleAt(editAction, ...), r, rCtx)
  // = apply(editAction, r, rCtx);
  // Spec B: it will be possible to run splitIn(editAction, count) and get a result
  function toSplitInCompatibleAt(editAction, count, contextInCount, contextOutCount) {
    printDebug("toSplitInCompatibleAt", editAction, count, contextInCount, contextOutCount);
    if(isReuse(editAction)) return editAction;
    if(isReplace(editAction)) {
      let [inCount, outCount, left, right] = argumentsIfReplace(editAction);
      if(count <= inCount) {
        /** Proof of spec B: the split will happen on the left with the same count, so it will work.*/
        return Replace(inCount, outCount, toSplitInCompatibleAt(left, count, inCount, outCount), right);
      } else {
        /** Proof of spec B: the split will happen on the right with count-inCount, so it will work.*/
        return Replace(inCount, outCount, toSplitInCompatibleAt(right, count-inCount, MinusUndefined(contextInCount, inCount), MinusUndefined(contextOutCount, outCount)));
      }
    }
    if(isRemoveExcept(editAction)) {
      let {keyOrOffset: offset, subAction} = editAction;
      
      /** Proof of spec B: the split will work directly.*/
      if(count <= offset.count) return editAction;
      /** Proof of spec B: the split will work directly.*/
      if(offset.newLength !== undefined && offset.count + offset.newLength <= count) {
        return editAction;
      }
      /** Proof of spec B: the split will be done on count - offset.count, so it will work.*/
      return RemoveExcept(offset, toSplitInCompatibleAt(subAction, count - offset.count, MinUndefined(offset.newLength, MinusUndefined(contextInCount, offset.count)), contextOutCount));
    }
    // This is not a Reuse. Let's wrap it as an prepend, either after remove, or before.
    /**
      Proof of Spec A:
        apply(toSplitInCompatibleAt(editAction, count, contextInCount, contextOutCount), r, rCtx)
      = apply(RemoveAll(Prepend(contextOutCount, UpIfNecessary(Offset(0, 0, contextInCount), editAction)), contextInCount), r, rCtx)
      = apply(Prepend(contextOutCount, UpIfNecessary(Offset(0, 0, contextInCount), editAction)), [], (Offset(0, 0, contextInCount), r)::rCtx)
      = apply(UpIfNecessary(Offset(0, 0, contextInCount), editAction), [], (Offset(0, 0, contextInCount), r)::rCtx) ++contextOutCount 
      apply(Reuse(), [], (Offset(0, 0, contextInCount), r)::rCtx)
      = apply(Up(Offset(0, 0, contextInCount), editAction), [], (Offset(0, 0, contextInCount), r)::rCtx) ++contextOutCount  []
      = apply(editAction, r, rCtx)
    */
    if(editAction.ctor == Type.Choose) {
      return Choose(Collection.map(editAction.subActions, toSplitInCompatibleAt))
    }
    return /*Choose(*/RemoveAll(Prepend(contextOutCount, UpIfNecessary(Offset(0, 0, contextInCount), editAction)), contextInCount)/*,
      Prepend(contextOutCount, UpIfNecessary(Offset(0, 0, contextInCount), RemoveAll(contextInCount))))*/;
  }
  
  
  
  // Core of merge and back-propagate.
  // The specification is hard to elaborate, but the idea is that
  // applyZ(merge(E1, E2), (r, rCtx))
  // = three way merge of r, applyZ(E1, (r, rCtx)) and applyZ(E2, (r, rCtx));
  
  // An input context helps to know on which input the current edit action is being applied to.
  // They alternate with Up. An Up() is always followed by an InputContext
  function InputContext(E, ICtx) {
    return {hd: E, tl: ICtx};
  }
  
  // We don't replace the edit action if ICtx is {hd:, tl:}, because it means that we went down without going down keys (e.g. Prepend, Append, New with insert)
  function AddInputContext(E, ICtx) {
    if(ICtx === undefined) {
      return InputContext(E);
    } else if(isEditAction(ICtx)){
      return InputContext(E, ICtx);
    } else { // ICtx is an input context {hd: EOld, tl: ICtxOld}
      return ICtx; //InputContext(E, ICtx.tl);
    }
  }
  
  function isInputContextTop(ICtx) {
    return ICtx === undefined || !isEditAction(ICtx) && ICtx.tl === undefined;
  }
  
  function inCountOf(ICtx) {
    if(isEditAction(ICtx) && ICtx.ctor == Type.Up && isOffset(ICtx.keyOrOffset)) {
      return ICtx.keyOrOffset.newLength;
    }
    return undefined;
  }
  
  // E2 is the edit action that applies at the current level.
  // Returns a sub action and a context
  function walkInUp(keyOrOffset, E2, ICtx2) {
    printDebug("walkInUp", keyOrOffset, E2, ICtx2);
    if(isUp(ICtx2)) { // ICtx2 is an input context element.
      let ko = ICtx2.keyOrOffset;
      if(isOffset(keyOrOffset)) {
        if(isOffset(ko)) {
          let newUpOffset = downUpOffsetReturnsUp(ko, keyOrOffset);
          let newDownOffset = upToDownOffset(newUpOffset);
          if(newDownOffset === undefined) { // Need to further go up.
            let nextICtx = ICtx2.subAction;
            return walkInUp(newUpOffset, isObject(nextICtx) ? nextICtx.hd : undefined, isObject(nextICtx) ? nextICtx.tl : undefined);
          } else {
            return walkInDown(newDownOffset, ICtx2.subAction.hd, ICtx2.subAction.tl);
          }
        } else { // Just forget about the non-offset 
          print("Error, should not have had a non-offset when walkin in up an offset:", keyOrOffset, E2, ICtx2);
          return [E2, ICtx2];
        }
      } else { // It's a key
        if(isOffset(ko)) {
          return walkInUp(keyOrOffset, E2, ICtx2.subAction);
        }
        if(ko !== keyOrOffset) {
          print("/!\\ Warning, in walkInUp, going up", keyOrOffset, "but context states", ko, ".")
        }
        return [ICtx2.subAction.hd, ICtx2.subAction.tl];
      }
    } else if(ICtx2 !== undefined) {
      return walkInUp(keyOrOffset, E2, ICtx2.tl);
    } else {
      return [ReuseKeyOrOffset(keyOrOffset, E2, outLength(E2)), NULL, NULL];
    }
  }
  // E2 is the edit action that applies at the given key or offset
  function walkInDown(keyOrOffset, E2, ICtx2) {
    printDebug("walkInDown", keyOrOffset, E2, ICtx2);
    return [keyOrOffsetIn(keyOrOffset, E2), Up(keyOrOffset, AddInputContext(E2, ICtx2))];
  }
  
  /**
    E1 and E2 are applied in the same context.
    We essentially return E1 except
    - when E1 is Reuse(), in which case, we return E2.
      - If E2 is Reuse() as well, we merge into respective keys
    Termination condition: E1 always decreases in size, or E1 stays the same and E2 decreases in size.
  */
  function mergeInto(E1, E2, ICtx2) {
    printDebug("mergeInto", E1, E2, ICtx2);
    let E1WasRaw = false, E1Original = E1;
    if(isRaw(E1)) {
      E1WasRaw = true; E1 = New(E1);
    }
    let E2WasRaw = false, E2Original = E2;
    if(isRaw(E2)) {
      E2WasRaw = true; E2 = New(E2);
    }
    if(!isReuse(E1)) { 
      switch(E1.ctor) {
        case Type.Up:
          var [newE2, newICtx2, residualUpOffset] = walkInUp(E1.keyOrOffset, E2, ICtx2);
          printDebug("Prepending Up(", E1.keyOrOffset);
          return Up(E1.keyOrOffset,
            mergeInto(
            residualUpOffset === undefined ? E1.subAction: Up(residualUpOffset, E1.subAction),
            newE2,
            newICtx2));
        case Type.Down:
          var [newE2, newICtx2] = walkInDown(E1.keyOrOffset, E2, ICtx2);
          printDebug("Prepending Down(", E1.keyOrOffset);
          return SameDownAs(E1)(E1.keyOrOffset,
            mergeInto(
            E1.subAction,
            newE2,
            newICtx2));
        case Type.New:
          // Not a reuse here.
          if(!isObject(E1.model.value)) {
            return E1Original;
          } else {
            printDebug("Prepending New({");
            let newChildren = mapChildren(E1.childEditActions, (k, c) => {
              printDebug("Inside New({", k, ":");
              return mergeInto(c, E2, ICtx2);
            });
            printDebug("Finished New(...})");
            return rawIfPossible(New(newChildren, E1.model), E1WasRaw);
          }
        case Type.Concat:
          printDebug("Inside Concat(_, |, _)");
          var newE1First = mergeInto(E1.first, E2, ICtx2);
          var newE1FirstLength = outLength(newE1First, inCountOf(ICtx2));
          if(newE1FirstLength === undefined) newE1FirstLength = E1.count;
          printDebug("Inside Concat(_, ",newE1First,", |)");
          let newE1Second = mergeInto(E1.second, E2, ICtx2);
          printDebug("building Concat(", newE1FirstLength, ", ", newE1First, ", ", newE1Second);
          let result = Concat(newE1FirstLength, newE1First, newE1Second, E1.replaceCount, E1.firstReuse, E1.secondReuse);
          return result;
        case Type.Choose:
          return Choose(Collection.map(E1.subActions, x => mergeInto(x, E2, ICtx2)));
        case Type.Custom: // Should never happen!
          return E1;
      }
    } else { // Final step: it's a Reuse. We can take what we have in E2 and merge with E1 as well.
      // What about other keys?
      if(!hasChildEditActions(E1)) {
        return E2;
      }
      // Ok, it has some keys, let's see what we can do.
      if(isPrepend(E2)) {
        printDebug("Prepending Prepend(", E2.count, ",", E2.first, "|");
        return Prepend(E2.count, E2.first, mergeInto(E1Original, E2.second, AddInputContext(E2, ICtx2)));
      }
      if(isAppend(E2)) {
        printDebug("Appending Append(_, |, ", E2.second);
        let newFirst = mergeInto(E1Original, E2.first, AddInputContext(E2, ICtx2));
        let newFirstLength = outLength(newFirst, E2.count);
        if(newFirstLength === undefined) newFirstLength = E2.count;
        return Append(newFirstLength, newFirst, E2.second);
      }
      if(isReplace(E2)) {
        let leftPart = offsetAt(Offset(0, E2.replaceCount), E1, false);
        let rightPart = offsetAt(Offset(E2.replaceCount), E1, false);
        printDebug("Replace case");
        return Concat(E2.count,
                 mergeInto(leftPart, E2.first, AddInputContext(E2, ICtx2)),
                 mergeInto(rightPart, E2.second, AddInputContext(E2, ICtx2)), E2.replaceCount);
      }
      if(isInsert(E2)) { // We do continue the wrapping
        let kWrap = keyIfInsert(E2);
        printDebug("Prepending ", E2);
        return New(mapChildren(E2.childEditActions, (k, c) => {
          if(k == kWrap) {
            printDebug("except for ", kWrap);
            return mergeInto(E1Original, c, AddInputContext(E2, ICtx2));
          } else {
            return c;
          }
        }), E2.model);
      }
      if(isReuse(E2)) {
        printDebug("Prepending Extend({");
        let finalChildren = mapChildren(E1.childEditActions, (k, c) => {
          printDebug("Inside Extend({ ", k, ":");
          if(k in E2.childEditActions) {
            return Down(k, mergeInto(Up(k, c), Up(k, E2.childEditActions[k]), Up(k, AddInputContext(E2, ICtx2))));
          } else {
            return Down(k, mergeInto(Up(k, c), Reuse(), Up(k, AddInputContext(E2, ICtx2))));
          }
        }, false);
        forEach(E2.childEditActions, (c, k) => {
          if(!(k in E1.childEditActions)) {
            finalChildren[k] = c;
          }
        });
        printDebug("Finishing Extend({...})");
        return New(finalChildren, ExtendModel(E1.model.create || E2.model.create));
      }
      return E1Original;
    }
  } // MergeInto
  editActions.mergeInto = mergeInto;
  
  // Soft specification:
  // if applyZ(E1, rrCtx) and applyZ(E2, rrCtx) is defined
  // then applyZ(merge(E1, E2), rrCtx) is defined.
  var merge = addLogMerge(function mergeRaw(E1, E2, ICtx1, ICtx2) {
    if(editActions.__debug) {
      printDebug("merge ", E1, E2, ICtx1, ICtx2);
    }
    let E1IsRaw = false, E1Original = E1;
    let E2IsRaw = false, E2Original = E2;
    if(!isEditAction(E1)) { E1IsRaw = true; E1 = New(E1); }
    if(!isEditAction(E2)) { E2IsRaw = true; E2 = New(E2); }
    if(E1.ctor == Type.Choose) {
      /** Proof:
          applyZ(merge(E1, E2), rrCtx)
        = apply(Choose(map(E1.subActions, x => merge(x, E2))), rrCtx)
        = apply(map(E1.subActions, x => merge(x, E2))[0], rrCtx)
        = apply(merge(E1.subActions[0], E2), rrCtx)
        Now, since applyZ(E1, rrCtx) = applyZ(E1.subActions[0],rrCtx) is defined,
        by induction, we obtain the result. QED;
      */
      return Choose(...Collection.map(E1.subActions, x => merge(x, E2Original, ICtx1, ICtx2)));
    }
    if(E2.ctor == Type.Choose) {
      /** Proof: Same as above. */
      return Choose(...Collection.map(E2.subActions, x => merge(E1Original, x, ICtx1, ICtx2)));
    }
    if(E1.ctor == Type.Clone) {
      return Clone(merge(E1.subAction, E2, ICtx1, ICtx2));
    }
    if(E2.ctor == Type.Clone) {
      return Clone(merge(E1, E2.subAction, ICtx1, ICtx2));
    }
    let result = [];
    merge_cases: {
      if(isIdentity(E1) && isInputContextTop(ICtx1)) {
        /** Proof: applyZ(merge(E1, E2), rrCtx) = apply(E2, rrCtx)
         Yes, however consider the following:
         merge(
           Reuse({b: New(1)}),
           Reuse({a: Up("a", Down("b"))}))
         With the code below, we would just have 
         Reuse({b: New(1), a: Up("a", Down("b"))})
         But since b was modified, we get the previous value of b. It makes more sense to have:
         Reuse({b: New(1), a: Up("a", Down("b", New(1)))})
        */
        result.push(E2Original);
        break merge_cases;
      }
      if(isIdentity(E2) && isInputContextTop(ICtx2)) {
        /** Proof: applyZ(merge(E1, E2), rrCtx) = apply(E1, rrCtx) */
        result.push(E1Original);
        break merge_cases;
      }
      
      // Wrapping and replacing
      // (E1, E2) is [R*, N, F, C, U, D, UR] x [R*, N, F, C, U, D, UR]
      if(E1.ctor == Type.New && E2.ctor == Type.New) {
        if(editActions.merge.hints) {
          let tmp;
          for(let hint of editActions.merge.hints) {
            tmp = hint(E1, E2);
            if(tmp) break;
          }
          if(tmp) {
            result.push(tmp);
            break merge_cases;
          }
        }
      }
      // (E1, E2) is [R*, N, F, C, U, D, UR] x [R*, N, F, C, U, D, UR] \ N0 x N0
      
      // We only merge children that have reuse in them. The other ones, we don't merge.
      let E1IsInsert = isConst(E1);
      let E2IsInsert = isConst(E2);
      let E1IsReusingBelow = E1IsInsert && isConstInserting(E1);
      let E2IsReusingBelow = E2IsInsert && isConstInserting(E2);
      if(E1IsInsert) {
        if(E1IsReusingBelow) {
          /** Proof:
              applyZ(merge(E1, E2), rrCtx)
            = applyZ(merge(New({k: ck}_k), E2), rrCtx)
            = applyZ(New({k: merge(ck, E2) | ck}_k), rrCtx)
            = New{k: applyZ(merge(ck, E2) | ck, rrCtx)}_k
            Since applyZ(E1, rrCtx) was defined, applyZ(ck, rrCtx) was defined. By induction, we conclude.
            QED;
          */
          result.push(New(mapChildren(E1.childEditActions, (k, c) =>
            access(E1.model.value, k) ? merge(c, E2, AddInputContext(E1, ICtx1), ICtx2) : mergeInto(c, E2, ICtx2)), E1.model));
        }
      }
      if(E2IsInsert) {
        if(E2IsReusingBelow) {
          /** Proof: Same as above*/
          result.push(New(mapChildren(E2.childEditActions, (k, c) =>
            access(E2.model.value, k) ? merge(E1, c, ICtx1, AddInputContext(E2, ICtx2)) : mergeInto(c, E1, ICtx1)), E2.model));
        }
      }
      if(!E1IsReusingBelow && !E2IsReusingBelow) {
        if(E1IsInsert) {
          /** Proof: Trivial */
          result.push(mergeInto(E1Original, E2, ICtx2));
        }
        if(E2IsInsert) {
          /** Proof: Trivial */
          result.push(mergeInto(E2Original, E1, ICtx1));
        }
        if(E1IsInsert || E2IsInsert) {
          /** Proof that result is not empty:
              if E1IsInsert, then result contains E1. If E2IsInsert, then result contains E2. QED */
          break merge_cases;
        }
      }
      
      let E1IsConcatNotReplace = E1.ctor == Type.Concat && !isReplace(E1);
      let E2IsConcatNotReplace = E2.ctor == Type.Concat && !isReplace(E2);
      if(E1IsConcatNotReplace && E2IsConcatNotReplace) {
        if(!E1.firstReuse && !E1.secondReuse && !E2.firstReuse && !E2.secondReuse) {
          result.push(E1);
          result.push(E2);
          break merge_cases;
        }
      }
      // Prepend are cancelled if there is a Down that removes the first offset.
      // A regular Concat is like a New.
      // We only merge children that have reuse in them. The other ones, we don't merge.
      let E1IsConcatReuse = E1IsConcatNotReplace && (E1.firstReuse || E1.secondReuse);
      let E2IsConcatReuse = E2IsConcatNotReplace && (E2.firstReuse || E2.secondReuse);
      let E1IsPrepend = E1IsConcatReuse && isPrepend(E1);
      let E2IsPrepend = E2IsConcatReuse && isPrepend(E2);
      let E1IsAppend = E1IsConcatReuse && isAppend(E1);
      let E2IsAppend = E2IsConcatReuse && isAppend(E2);
      if(E1IsAppend && E2IsAppend) {
        let newRemaining = merge(E1.first, E2.first, AddInputContext(E1, ICtx1), AddInputContext(E2, ICtx2));
        // There might be only one solution is the prepended thing is the same.
        if(isConst(E1.second) && isConst(E2.second)) {
          let v1 = valueIfConst(E1.second);
          let v2 = valueIfConst(E2.second);
          let secondWasRaw = !isEditAction(E1.second) && !isEditAction(E2.second);
          if(typeof v1 == "string" && typeof v2 == "string") {
            if(v1 + v2 == v2 + v1) {
              result.push(Append(MinUndefined(E1.count, E2.count), newRemaining, rawIfPossible(New(v1 + v2), secondWasRaw)));
              break merge_cases;
            } else {
              result.push(Append(MinUndefined(E1.count, E2.count), newRemaining, Choose(rawIfPossible(New(v1 + v2), secondWasRaw), rawIfPossible(New(v2 + v1), secondWasRaw)), newRemaining));
              break merge_cases;
            }
          }
        }
      }
      if(E1IsPrepend && E2IsPrepend) {
        let newRemaining = merge(E1.second, E2.second, AddInputContext(E1, ICtx1), AddInputContext(E2, ICtx2));
        // There might be only one solution is the prepended thing is the same.
        if(isConst(E1.first) && isConst(E2.first)) {
          let v1 = valueIfConst(E1.first);
          let v2 = valueIfConst(E2.first);
          let firstWasRaw = !isEditAction(E1.first) && !isEditAction(E2.first);
          if(typeof v1 == "string" && typeof v2 == "string") {
            if(v1 + v2 == v2 + v1) {
              result.push(Prepend(v1.length + v2.length, rawIfPossible(New(v1 + v2), firstWasRaw), newRemaining));
              break merge_cases;
            } else {
              result.push(Prepend(v1.length + v2.length, Choose(rawIfPossible(New(v1 + v2), firstWasRaw), rawIfPossible(New(v2 + v1), firstWasRaw)), newRemaining));
              break merge_cases;
            }
          }
        }
      }
      // Particular case for two Prepend and two Append so that we don't compute them.
      if(E1IsConcatReuse) {
        let newFirst = E1.firstReuse ? merge(E1.first, E2, AddInputContext(E1, ICtx1), ICtx2) : mergeInto(E1.first, E2, ICtx2);
        let newFirstLength = outLength(newFirst);
        printDebug("newFirstLength", newFirstLength);
        if(newFirstLength === undefined) newFirstLength = E1.count;
        let newRight = E1.secondReuse ? merge(E1.second, E2, AddInputContext(E1, ICtx1), ICtx2) : mergeInto(E1.second, E2, ICtx2);
        result.push(
          Concat(newFirstLength, newFirst, newRight, undefined, E1.firstReuse, E1.secondReuse));
      }
      if(E2IsConcatReuse) {
        let newFirst = E2.firstReuse ? merge(E1, E2.first, ICtx1, AddInputContext(E2, ICtx2)) : mergeInto(E2.first, E1, ICtx1);
        let newFirstLength = outLength(newFirst);
        printDebug("newFirstLength", newFirstLength);
        if(newFirstLength === undefined) newFirstLength = E2.count;
        let newSecond = E2.secondReuse ? merge(E1, E2.second, ICtx1, AddInputContext(E2, ICtx2)) : mergeInto(E2.second, E1, ICtx1);
        result.push(
          Concat(newFirstLength, newFirst, newSecond, undefined, E2.firstReuse, E2.secondReuse));
      }
      if(!E1IsConcatReuse && !E2IsConcatReuse) {
        if(E1IsConcatNotReplace) {
          result.push(E1);
        }
        if(E2IsConcatNotReplace) {
          result.push(E2);
        }
        if(E1IsConcatNotReplace || E2IsConcatNotReplace) {
          break merge_cases;
        }
      }
      if(E1IsConcatReuse || E2IsConcatReuse) {
        break merge_cases;
      }
      // If nothing was added, it means that:
      
      // We will deal with RemoveExcept later. Let's deal with regular Down
      // For now, it looks like
      let E1IsPureDown = isDown(E1) && !isRemoveExcept(E1);
      let E2IsPureDown = isDown(E2) && !isRemoveExcept(E2);
      if(E1IsPureDown && E2IsPureDown && keyOrOffsetAreEqual(E1.keyOrOffset, E2.keyOrOffset)) {
        result.push(Down(E1.keyOrOffset,
          merge(E1.subAction, E2.subAction,
            Up(E1.keyOrOffset, AddInputContext(E1, ICtx1)),
            Up(E2.keyOrOffset, AddInputContext(E2, ICtx2)))));
      } else {
        // Not the same keys or offsets.
        if(E1IsPureDown) {
          let newE2 = keyOrOffsetIn(E1.keyOrOffset, E2);
          result.push(
            Down(E1.keyOrOffset,
              merge(E1.subAction, newE2,
                Up(E1.keyOrOffset, AddInputContext(E1, ICtx1)),
                Up(E1.keyOrOffset, AddInputContext(E2, ICtx2)))));
          // Let's see if we can apply the key or offset to E2.
        }
        if(E2IsPureDown && !E1IsPureDown) {
          let newE1 = keyOrOffsetIn(E2.keyOrOffset, E1);
          result.push(
            Down(E2.keyOrOffset,
              merge(newE1, E2.subAction,
                Up(E2.keyOrOffset, AddInputContext(E1, ICtx1)),
                Up(E2.keyOrOffset, AddInputContext(E2, ICtx2)))));
          // Let's see if we can apply the key or offset to E2.
        }
      }
      if(E1IsPureDown ||
         E2IsPureDown) {
        break merge_cases;   
      }
      // No more pure Down now.
      
      let E1IsUp = E1.ctor == Type.Up;
      let E2IsUp = E2.ctor == Type.Up;
      if(E1IsUp && E2IsUp && keyOrOffsetAreEqual(E1.keyOrOffset, E2.keyOrOffset)) {
        result.push(Up(E1.keyOrOffset, merge(E1.subAction, E2.subAction, walkInUp(E1.keyOrOffset, E1, ICtx1)[1], walkInUp(E2.keyOrOffset, E2, ICtx2)[1])));
      } else { // If they are both Up and not equal, it means they are different offsets.
        if(E1IsUp) {
          result.push(mergeInto(E1, E2, ICtx2));
          //result.push(E1);
        }
        if(E2IsUp) {
          result.push(mergeInto(E2, E1, ICtx1));
          //result.push(E2);
        }
      }
      if(E1IsUp ||
         E2IsUp) {
        break merge_cases;   
      }
      // No more New, Concat, Down or Up
      // Only Reuse, Replace, and RemoveExcept now, and Custom
      
      let E1IsCustom = E1.ctor == Type.Custom;
      let E2IsCustom = E2.ctor == Type.Custom;
      // We only merge it once.
      if(E1IsCustom && typeof E1.lens.merge == "function") {
        result.push(E1.lens.merge(E1, E2));
      } else if(E2IsCustom && typeof E2.lens.merge == "function") {
        result.push(E2.lens.merge(E2, E1));
      }
      if(E1IsCustom ||
         E2IsCustom) {
        break merge_cases;   
      }
      
      // No more New, Concat, Down or Up
      // Only Reuse, Replace, and RemoveExcept now.
      
      /*let [keepOnlyCount, keepOnlySub] = argumentsIfKeepOnly(E1);
      if(keepOnlyCount !== undefined && isIdentity(keepOnlySub) && keepOnlyCount > 0) {
        // We replace the KeepOnly by an explicit Replace and RemoveAll, which is better suited for merging.
        console.log("Old E1", stringOf(E1));
        E1 = Keep(keepOnlyCount, RemoveAll());
        console.log("New E1", stringOf(E1));
      }
      let [keepOnlyCount2, keepOnlySub2] = argumentsIfKeepOnly(E2);
      if(keepOnlyCount2 !== undefined && isIdentity(keepOnlySub2) && keepOnlyCount2 > 0) {
        // We replace the KeepOnly by an explicit Replace and RemoveAll, which is better suited for merging.
        E2 = Keep(keepOnlyCount2, RemoveAll());
        console.log("New E2", stringOf(E2));
      }*/
      
      // We start by all Reuse pairs:
      // Reuse / Reuse
      if(isReuse(E1) && isReuse(E2)) {
        // Merge key by key.
        let o = mapChildren(E1.childEditActions, (k, c) => {
          return Down(k, merge(Up(k, c), k in E2.childEditActions ? Up(k, E2.childEditActions[k]) : Reuse(), Up(k, AddInputContext(E1, ICtx1)), Up(k, AddInputContext(E2, ICtx2))));
        }, /*canReuse*/false);
        for(let k in E2.childEditActions) {
          if(!(k in E1.childEditActions)) {
            o[k] = Down(k, merge(Reuse(), Up(k, E2.childEditActions[k]), Up(k, AddInputContext(E1, ICtx1)), Up(k, AddInputContext(E2, ICtx2))));
          }
        }
        result.push(New(o, ExtendModel(E1.model.create || E2.model.create)));
      // (E1, E2) is [R*, F, C, U, D, UR] x [R*, F, C, U, D, UR] \ R* x R*
      } else if(isReuse(E1) && isReplace(E2)) {
        let [inCount, outCount, left, right] = argumentsIfReplace(E2);
        let [o1, l1, r1] = splitIn(inCount, E1);
        let newFirst = merge(l1, left, Up(Offset(0, inCount), AddInputContext(E1, ICtx1)),
                                       Up(Offset(0, inCount), AddInputContext(E2, ICtx2)));
        let newSecond = merge(r1, right, Up(Offset(inCount), AddInputContext(E1, ICtx1)),
                                         Up(Offset(inCount), AddInputContext(E2, ICtx2)));
        let newCount = outLength(newFirst);
        if(newCount === undefined) newCount = outCount;
        result.push(Replace(inCount, outCount, newFirst, newSecond));
      } else if(isReuse(E2) && isReplace(E1)) {
        let [inCount, outCount, left, right] = argumentsIfReplace(E1);
        let [o2, l2, r2] = splitIn(inCount, E2);
        let newFirst = merge(left, l2, Up(Offset(0, inCount), AddInputContext(E1, ICtx1)),
                                       Up(Offset(0, inCount), AddInputContext(E2, ICtx2)));
        let newSecond = merge(right, r2, Up(Offset(inCount), AddInputContext(E1, ICtx1)),
                                         Up(Offset(inCount), AddInputContext(E2, ICtx2)));
        let newCount = outLength(newFirst);
        if(newCount === undefined) newCount = outCount;
        result.push(Replace(inCount, outCount, newFirst, newSecond));
      } else if(isReuse(E1) && isRemoveExcept(E2)) {
        // E1 being a Reuse, offsetIn is always defined.
        let restricted = offsetIn(E2.keyOrOffset, E1)[0];
        result.push(RemoveExcept(E2.keyOrOffset,
          merge(restricted, E2.subAction, Up(E2.keyOrOffset, AddInputContext(E1, ICtx1)),
                                          Up(E2.keyOrOffset, AddInputContext(E2, ICtx2)))));
      } else if(isReuse(E2) && isRemoveExcept(E1)) {
        let restricted = offsetIn(E1.keyOrOffset, E2)[0];
        // E2 being a Reuse, offsetIn is always defined.
        result.push(RemoveExcept(E1.keyOrOffset,
          merge(E1.subAction, restricted, Up(E2.keyOrOffset, AddInputContext(E1, ICtx1)),
                                          Up(E2.keyOrOffset, AddInputContext(E2, ICtx2)))));
        // No more Reuse now.
      } else if(isRemoveExcept(E1) && isRemoveExcept(E2)) {
        if(keyOrOffsetAreEqual(E1.keyOrOffset, E2.keyOrOffset)) {
          let sub = merge(E1.subAction, E2.subAction,
              Up(E1.keyOrOffset, AddInputContext(E1, ICtx1)),
              Up(E1.keyOrOffset, AddInputContext(E2, ICtx2))
            );
          result.push(RemoveExcept(E1.keyOrOffset, sub));
        } else {
          let commonOffset = intersectOffsets(E1.keyOrOffset, E2.keyOrOffset);
          printDebug("Prepending RemoveExcept(", commonOffset);
          let sub = merge(offsetIn(commonOffset, E1, false, true)[0], offsetIn(commonOffset, E2, false, true)[0],
              Up(commonOffset, AddInputContext(E1, ICtx1)),
              Up(commonOffset, AddInputContext(E2, ICtx2))
            );
          // We change the input. So we use offsetIn.
          result.push(//Remove(commonOffset.count,
                      RemoveExcept(commonOffset, 
            sub));
        }
      } else if(isRemoveExcept(E1) && isReplace(E2)) {
        
        // RemoveExcept(Offset(count, newLength), ERemaining)
        // 1) Apply removals on the left and on the right
        // 2) If ERemaining is not Reuse(), merge with
        //      if newLength != undefined
        //           Keep(count, Replace(newLength, newOutLength, ERemaining))
        //      else Keep(count, ERemaining)
        let [inCount, outCount, left, right] = argumentsIfReplace(E2);
        let {count, newLength, oldLength} = E1.keyOrOffset;
        // Special case if E2 is a Keep
        let [keepCount, keepAction] = argumentsIfReplaceIsKeep(inCount, outCount, left, right);
        if(keepCount !== undefined && count >= keepCount) {
          // We just remove the Keep
          result.push(Remove(keepCount, merge(RemoveExcept(Offset(count - keepCount, MinusUndefined(newLength, keepCount), MinusUndefined(oldLength, keepCount)), E1.subAction), keepAction,
            Up(Offset(keepCount), AddInputContext(E1, ICtx1)),
            Up(Offset(keepCount), AddInputContext(E2, ICtx2))
          )));
        } else if(keepCount !== undefined && count > 0) {
          result.push(Remove(count, merge(RemoveExcept(Offset(0, MinusUndefined(newLength, count), MinusUndefined(oldLength, count)), E1.subAction), Keep(keepCount - count, keepAction),
            Up(Offset(count), AddInputContext(E1, ICtx1)),
            Up(Offset(count), AddInputContext(E2, ICtx2))
          )));
        } else {
          let newLeft = left, newRight = right;
          if(count != 0 || !LessThanEqualUndefined(inCount, PlusUndefined(count, newLength))) {
            let leftStart = MinUndefined(count, inCount);
            let leftEnd = MinUndefined(PlusUndefined(count, newLength), inCount);
            newLeft = merge(leftStart === leftEnd ?
                RemoveAll() :
                RemoveExcept(
                  Interval(leftStart, leftEnd)), left,
              Up(Offset(0, inCount), AddInputContext(E1, ICtx1)),
              Up(Offset(0, inCount), AddInputContext(E2, ICtx2)))
          }
          if(count > inCount || newLength !== undefined) {
            let newStart = Math.max(0, count - inCount);
            let newEnd = MinusUndefined(PlusUndefined(count, newLength), inCount);
            newRight = merge(RemoveExcept(Interval(newStart, newEnd)), right,
                  Up(Offset(inCount), AddInputContext(E1, ICtx1)),
                  Up(Offset(inCount), AddInputContext(E2, ICtx2)))
          }
          let newLeftLength = outLength(newLeft, inCount);
          let newE2 = Replace(inCount, newLeftLength, newLeft, newRight);
          if(isIdentity(E1.subAction)) {
            result.push(newE2);
          } else {
            let subInLength = newLength;
            let subOutLength = outLength(E1.subAction, subInLength);
            result.push(
              merge(newLength !== undefined ?
                  Keep(count, Replace(subInLength, subOutLength, E1.subAction)) :
                  Keep(count, E1.subAction),
                  newE2,
                  ICtx1, ICtx2));
          }
        }
      } else if(isReplace(E1) && isRemoveExcept(E2)) {
        // RemoveExcept(Offset(count, newLength), ERemaining)
        // 1) Apply removals on the left and on the right
        // 2) If ERemaining is not Reuse(), merge with
        //      if newLength != undefined
        //           Keep(count, Replace(newLength, newOutLength, ERemaining))
        //      else Keep(count, ERemaining)
        let [inCount, outCount, left, right] = argumentsIfReplace(E1);
        let {count, newLength, oldLength} = E2.keyOrOffset;
        let [keepCount, keepAction] = argumentsIfReplaceIsKeep(inCount, outCount, left, right);
        if(keepCount !== undefined && count >= keepCount) {
          // We just remove the Keep
          result.push(Remove(keepCount, merge(keepAction, RemoveExcept(Offset(count - keepCount, MinusUndefined(newLength, keepCount), MinusUndefined(oldLength, keepCount)), E2.subAction),
            Up(Offset(keepCount), AddInputContext(E1, ICtx1)),
            Up(Offset(keepCount), AddInputContext(E2, ICtx2))
          )));
        } else if(keepCount !== undefined && count > 0) {
          result.push(Remove(count, merge(Keep(keepCount - count, keepAction), RemoveExcept(Offset(0, MinusUndefined(newLength, count), MinusUndefined(oldLength, count)), E2.subAction),
            Up(Offset(count), AddInputContext(E1, ICtx1)),
            Up(Offset(count), AddInputContext(E2, ICtx2))
          )));
        } else {
          let newLeft = left, newRight = right;
          if(count != 0 || !LessThanEqualUndefined(inCount, PlusUndefined(count, newLength))) {
            let leftStart = count, leftEnd = MinUndefined(PlusUndefined(count, newLength), inCount);
            newLeft = merge(left, leftStart === leftEnd ?
                RemoveAll() :
                RemoveExcept(
                  Interval(leftStart, leftEnd)),
              Up(Offset(0, inCount), AddInputContext(E1, ICtx1)),
              Up(Offset(0, inCount), AddInputContext(E2, ICtx2)))
          }
          if(count > inCount || newLength !== undefined) {
            let newStart = Math.max(0, count - inCount);
            let newEnd = MinusUndefined(PlusUndefined(count, newLength), inCount);
            newRight = merge(right, RemoveExcept(Interval(newStart, newEnd)),
                  Up(Offset(inCount), AddInputContext(E1, ICtx1)),
                  Up(Offset(inCount), AddInputContext(E2, ICtx2)))
          }
          let newLeftLength = outLength(newLeft, inCount);
          let newE1 = Replace(inCount, newLeftLength, newLeft, newRight);
          if(isIdentity(E2.subAction)) {
            result.push(newE1);
          } else {
            let subInLength = newLength;
            let subOutLength = outLength(E2.subAction, subInLength);
            result.push(
              merge(newE1,
                  newLength !== undefined ?
                  Keep(count, Replace(subInLength, subOutLength, E2.subAction)) :
                  Keep(count, E2.subAction),
                  ICtx1, ICtx2));
          }
        }
      } else if(isReplace(E1) && isReplace(E2)) {
        printDebug("Two replaces");
        let [inCount1, outCount1, left1, right1] = argumentsIfReplace(E1);
        let [inCount2, outCount2, left2, right2] = argumentsIfReplace(E2);
        if(inCount1 == 0) {
          result.push(Prepend(outCount1, UpIfNecessary(Offset(0, 0), left1),
            merge(right1, E2, AddInputContext(E1, ICtx1), ICtx2)));
        }
        if(inCount2 == 0) {
          result.push(Prepend(outCount2, UpIfNecessary(Offset(0, 0), left2),
            merge(E1, right2, ICtx1, AddInputContext(E2, ICtx2))));
        }
        if(inCount1 == 0 || inCount2 == 0) { // done prepending
          break merge_cases;
        }
        if(outCount1 == 0 && outCount2 == 0) {
          // Two replacements with empty content. We replace them by Remove?
          let minRemove = Math.min(inCount1, inCount2);
          result.push(Remove(minRemove, merge(
            inCount1 == minRemove ? right1 : Remove(inCount1 - minRemove, right1),
            inCount2 == minRemove ? right2 : Remove(inCount2 - minRemove, right2),
            Up(Offset(minRemove), AddInputContext(E1, ICtx1)),
            Up(Offset(minRemove), AddInputContext(E2, ICtx1)))));
        // We are left with non-Prepends which are not both deletions.
        } else if(inCount1 == inCount2) { // Aligned replaces
          let newLeft = merge(left1, left2,
            Up(Offset(0, inCount1), AddInputContext(E1, ICtx1)),
            Up(Offset(0, inCount1), AddInputContext(E2, ICtx2))
          );
          let newLeftCount = MinUndefined(outLength(newLeft, inCount1), outCount1 + outCount2);
          let newRight = merge(right1, right2,
            Up(Offset(inCount1), AddInputContext(E1, ICtx1)),
            Up(Offset(inCount1), AddInputContext(E2, ICtx2))
          );
          result.push(Replace(inCount1, newLeftCount, newLeft, newRight));
        } else if(inCount1 < inCount2) {
          let [o2, l2, r2] = splitIn(inCount1, E2); // We split the bigger left if possible.
          if(r2 !== undefined) {
            let newLeft = merge(left1, l2,
              Up(Offset(0, inCount1), AddInputContext(E1, ICtx1)),
              Up(Offset(0, inCount1), AddInputContext(E2, ICtx2)));
            let newRight = merge(right1, r2,
              Up(Offset(inCount1), AddInputContext(E1, ICtx1)),
              Up(Offset(inCount1), AddInputContext(E2, ICtx2)));
            let newLeftCount = MinUndefined(outLength(newLeft, inCount1), outCount1 + outCount2);
            printDebug("#-1")
            result.push(Replace(inCount1, newLeftCount, newLeft, newRight));
          } else {
            // We were not able to split E2 at the given count.
            // Let's convert it 
            // We split the right if possible
            let [o1, l1, r1] = splitIn(inCount2, E1);
            if(r1 !== undefined) {
              let newLeft = merge(l1, left2,
                Up(Offset(0, inCount2), AddInputContext(E1, ICtx1)),
                Up(Offset(0, inCount2), AddInputContext(E2, ICtx2)));
              let newRight = merge(r1, right2,
                Up(Offset(inCount2), AddInputContext(E1, ICtx1)),
                Up(Offset(inCount2), AddInputContext(E2, ICtx2)));
              let newLeftCount = MinUndefined(outLength(newLeft, inCount2), outCount1 + outCount2);
              printDebug("#0")
              result.push(Replace(inCount2, newLeftCount, newLeft, newRight));
            } else {
              printDebug("#1")
              result.push(merge(E1, toSplitInCompatibleAt(E2, inCount1), ICtx1, AddInputContext(E2, ICtx2)));
              //result.push(merge(toSplitInCompatibleAt(E1, inCount2), E2));
            }
          }
        } else { // inCount1 > inCount2
          // [  inCount1   |   ] [.....]
          // [  inCount2   ][     .... ]
          let [o1, l1, r1] = splitIn(inCount2, E1);
          if(r1 !== undefined) {
            let newLeft = merge(l1, left2,
                Up(Offset(0, inCount2), AddInputContext(E1, ICtx1)),
                Up(Offset(0, inCount2), AddInputContext(E2, ICtx2)));
            let newRight = merge(r1, right2,
                Up(Offset(inCount2), AddInputContext(E1, ICtx1)),
                Up(Offset(inCount2), AddInputContext(E2, ICtx2)));
            let newLeftCount = outLength(newLeft, inCount2);
            printDebug("newLeftCount", newLeftCount);
            newLeftCount = MinUndefined(newLeftCount, outCount1 + outCount2);
            printDebug("#2")
            result.push(Replace(inCount2, newLeftCount, newLeft, newRight));
          } else {
            let [o2, l2, r2] = splitIn(inCount1, E2); // We split the bigger left first if possible.
            if(r2 !== undefined) {
              let newLeft = merge(left1, l2,
                Up(Offset(0, inCount1), AddInputContext(E1, ICtx1)),
                Up(Offset(0, inCount1), AddInputContext(E2, ICtx2)));
              let newRight = merge(right1, r2,
                Up(Offset(inCount1), AddInputContext(E1, ICtx1)),
                Up(Offset(inCount1), AddInputContext(E2, ICtx2)));
              let newLeftCount = MinUndefined(outLength(newLeft, inCount1), outCount1 + outCount2);
              printDebug("#3")
              result.push(Replace(inCount1, newLeftCount, newLeft, newRight));
            } else {
              printDebug("#4")
              result.push(merge(toSplitInCompatibleAt(E1, inCount2), E2, AddInputContext(E1, ICtx1), ICtx2));
              //result.push(merge(E1, toSplitInCompatibleAt(E2, inCount1))); // Not always possible, since we don't know the output length of the right of E2
            }
          }
        }
      }
    }
    return Choose(...result);
  });
  editActions.merge = merge;
  
  function walkDownPath(downPath, r, rCtx) {
    if(isIdentity(downPath)) return [r, rCtx];
    let [r2, rCtx2] = walkDownCtx(downPath.keyOrOffset, r, rCtx);
    return walkDownPath(downPath.subAction, r2, rCtx2);
  }
  // Function never called. Just here to prove something.
  function InvariantHelper(upPath, acc, E, r, rCtx) {
    if(isIdentity(upPath)) return undefined;
    return AddContext(upPath.keyOrOffset, applyZ(ReuseKeyOrOffset(upPath.keyOrOffset, E), walkDownPath(reversePath(upPath.subAction), r, rCtx)), InvariantHelper(upPath.subAction, Down(upPath.keyOrOffset, acc), ReuseKeyOrOffset(upPath.keyOrOffset, E), r, rCtx));
  }
  
  //"If I follow the reverse path given to ReuseUp in the original record context, and then the path given to acc, and then I apply the edit action on this context, it's the same as if I followed applied the result of ReuseUp and then followed the reverse path given to Reuse Up and then the acc.
  /* Specification:
   apply(rev(upPath, acc),
     apply(ReuseUp(upPath, editAction), r, rCtx), [])
   = apply(acc,
       applyZ(editAction, walkDownPath(rev(upPath, Reuse()), r, rCtx)), InvariantHelper(upPath, acc, editAction, r, rCtx))
  */
  /* Another form but i don't know what value to give to ?
   apply(andThen(rev(upPath, acc), ReuseUp(upPath, editAction), []), r, rCtx)
   = applyZ(andThen(acc, editAction, ?), walkDownPath(rev(upPath, Reuse()), r, rCtx))
  */
  // Spec A: initUp is only a path made of Up and Reuse().
  // Spec B: 
  //   applyZ(andThen(reversePath(path, acc), ReuseUp(path, editAction)), <r, rCtx>)
  // = applyZ(andThen(acc, editAction), walkDownPath(acc, <r, rCtx>))
  function ReuseUp(initUp, action, outLengthAction) {
    let finalUp = initUp;
    while(!isIdentity(finalUp)) {
      printDebug("ReuseUp", initUp, action);
      // only here we can combine key and offset into a single key.
      if(finalUp && finalUp.subAction && isOffset(finalUp.subAction.keyOrOffset) && isKey(finalUp.keyOrOffset)) {
        /** Proof:
          apply(rev(Up(k, offset, X), acc), applyZ(ReuseUp(Up(k, offset, X), E), <r, rCtx>), [])
        = apply(rev(Up(k, offset, X), acc), applyZ(ReuseUp(Up(k+c, X), mapUpHere(E, O(-c, o, n), Up(k))), <r, rCtx>), [])
        = apply(rev(Up(k+c, X), acc), applyZ(ReuseUp(Up(k+c, X), mapUpHere(E, O(-c, o, n), Up(k))), <r, rCtx>), [])
        Induction
        = apply(acc, applyZ(mapUpHere(E, O(-c, o, n), Up(k)), walkDownPath(rev(Up(k+c, X)), r, rCtx)),
          InvariantHelper(Up(k+c, X), acc, E, r, rCtx)
        )
        (acc is only Down so the invariantHelper is useless)
        ?
        = apply(acc, applyZ(E, walkDownPath(rev(Up(k, offset, X)), r, rCtx)),
          InvariantHelper(Up(k, offset, X), acc, E, r, rCtx)
          
        We just need to show that:
        applyZ(mapUpHere(E, O(-c, o, n), Up(k)), walkDownPath(rev(Up(k+c, X)), r, rCtx))
        = applyZ(mapUpHere(E, O(-c, o, n), Up(k)), R[k+c], (k+c, R)::walkDownPath(rev(X), r, rCtx))
        = apply(E, R[k+c], (k, R[])::(offset, R)::walkDownPath(rev(X), r, rCtx))
        = apply(E, walkDownPath(rev(Up(k, offset, X)), r, rCtx))
        QED
        
        Sub-proof:
        
        We assumed that
        walkDownPath(rev(Up(a, E), acc), r, rCtx)
        = walkDownPath(acc, <R[a], (a, R)::RCtx>)
        for some R and RCtx. Is it true?
        
        if E = Reuse(), then
        walkDownPath(rev(Up(a), acc), r, rCtx)
        =walkDownPath(Down(a, acc), r, rCtx)
        =walkDownPath(acc, <r[a], (a, r)::rCtx>)
        True.
        
        walkDownPath(rev(Up(a, Up(b, X))), acc), <r, rCtx>)
        = walkDownPath(rev(Up(b, X), Down(a, acc)), <r, rCtx>)
        = (induction)
        = walkDownPath(Down(a, acc), <R[b], (b, R)::RCtx>)
        = walkDownPath(acc, <R[b][a], (a, R[b])::(b, R)::RCtx>)
        = walkDownPath(acc, <R'[a], (a, R')::RCtx')
        QED;
        */
        let oldKey = Number(finalUp.keyOrOffset)
        action = mapUpHere(action, downToUpOffset(finalUp.subAction.keyOrOffset),
          Up(oldKey)
        );
        let newKey = Number(finalUp.keyOrOffset) + finalUp.subAction.keyOrOffset.count;
        finalUp = Up(newKey, finalUp.subAction.subAction);
        continue;
      }
      if(editActions.__debug) {
        console.log("ReuseUp goes up " + keyOrOffsetToString(finalUp.keyOrOffset) + " on " + stringOf(action));
      }
      /** Proof for keys.
        apply(rev(Up(k, X), acc), applyZ(ReuseUp(Up(k, X), E), <r, rCtx>), [])
        = apply(rev(X, Down(k, acc)),
          applyZ(ReuseUp(X, Reuse({k: E})), <r, rCtx>), [])
        By induction
        = apply(Down(k, acc), applyZ(Reuse({k: E}), walkDownPath(rev(X, Reuse()), <r, rCtx>)), InvariantHelper(X, Down(k, acc), Reuse({k: E}), r, rCtx))
        = apply(Down(k, acc), {...k: applyZ(E, walkDown(k, walkDownPath(rev(X, Reuse()), <r, rCtx>)))...}, InvariantHelper(...))
        = apply(acc, applyZ(E, walkDown(k, walkDownPath(rev(X, Reuse()), <r, rCtx>))), (k, applyZ(Reuse({k: E}), walkDownPath(rev(X, Reuse()), <r, rCtx>)))::InvariantHelper(...))
        = apply(acc, applyZ(E,  walkDownPath(rev(X, Down(k)), <r, rCtx>)), (k, applyZ(Reuse({k: E}), walkDownPath(rev(X, Reuse()), <r, rCtx>)))::InvariantHelper(...))
        = apply(acc, applyZ(E,  walkDownPath(rev(Up(k, X), Reuse()), <r, rCtx>)), (k, applyZ(Reuse({k: E}), walkDownPath(rev(X, Reuse()), <r, rCtx>)))::InvariantHelper(X, Down(k, acc), Reuse({k: E}), r, rCtx))
        = apply(acc, applyZ(E, walkDownPath(rev(Up(k, X), Reuse()), <r, rCtx>)), InvariantHelper(Up(k, X), acc, E, r, rCtx))
        QED;
        
        Proofs for offsets: TODO:
        
      */
      action = ReuseKeyOrOffset(finalUp.keyOrOffset, action, outLengthAction);
      finalUp = finalUp.subAction;
    }
    /** Proof:
     
     
     apply(E, apply(rev(Reuse()), r, rCtx), ?1)
     = apply(E, apply(Reuse(), r, rCtx), ?1)
     = apply(E, r, rCtx)
     = apply(Reuse(), apply(E, r, rCtx), ?2)
     = apply(Reuse(), apply(ReuseUp(Reuse(), E), r, rCtx), ?2)
     = apply(rev(Reuse()), apply(ReuseUp(rev(Reuse()), E), r, rCtx), ?2)
    */
    return action;
  }
  editActions.__ReuseUp = ReuseUp;
  
  /* Same as partitionEdit but only outputs an edit that mimics U on the context of E, without creating sub-problems.
     Down of E are converted to Reuse({: })
  */
  function cloneOf(E, U, ECtx) {
    printDebug("cloneOf", "E", E, "U", U, "ECtx", ECtx);
    let EWasRaw, ERaw = E;
    if(!isEditAction(E)) {
      EWasRaw = true;
      E = New(E);
    }
    if(E.ctor == Type.Down) {
      printDebug("prepending Reuse({ ", E.keyOrOffset, ": ...})");
      return ReuseKeyOrOffset(E.keyOrOffset, cloneOf(E.subAction, U, Up(E.keyOrOffset, ECtx)));
    }
    if(E.ctor == Type.Up) {
      printDebug("prepending Up(", E.keyOrOffset, ", ...)");
      return Up(E.keyOrOffset, cloneOf(E.subAction, U, Down(E.keyOrOffset, ECtx)));
    }
    let wasRaw = false, UOriginal = U;
    if(!isEditAction(U)) {
      wasRaw = true;
      U = New(U);
    }
    if(U.ctor == Type.Up) {
      if(ECtx === undefined) {
        console.trace("/!\\ Error, trying to go up " + keyOrOffsetToString(U.keyOrOffset) + " but empty context");
      }
      if(ECtx.ctor == Type.Up || ECtx.ctor == Type.Down) {
        let newECtx = ECtx.subAction;
        if(editActions.__debug) {
          console.log("Pre-pending " + (ECtx.ctor == Type.Up ? "Up" : "Down") + "(" + keyOrOffsetToString(ECtx.keyOrOffset) + ", |)");
        }
        let solution = cloneOf(E, U, newECtx)
        if(ECtx.ctor == Type.Up) {
          return Up(ECtx.keyOrOffset, solution);
        }
        //if(ECtx.ctor == Type.Down) {
        return Down(ECtx.keyOrOffset, solution);
        //}
      }
      let [E1p, E1Ctxp, newSecondUpOffset] = walkUpActionCtx(U.keyOrOffset, E, ECtx);
      return cloneOf(E1p, newSecondUpOffset ? Up(newSecondUpOffset, U.subAction) : U.subAction, E1Ctxp);
    }
    if(U.ctor == Type.Down) {
      if(isReuse(E) && isKey(U.keyOrOffset)) {
        let childE = childIfReuse(E, U.keyOrOffset);
        return (SameDownAs(U))(U.keyOrOffset, cloneOf(childE, U.subAction, Up(U.keyOrOffset, AddContext(U.keyOrOffset, E, ECtx))));
      }
      // Not a good idea, because the Ups and Down in ECtx will be converted to Reuse...
      let [E1p, E1Ctxp] = walkDownActionCtx(U.keyOrOffset, E, ECtx, U.isRemove);
      if(editActions.__debug) {
        console.log("After walking down " + keyOrOffsetToString(U.keyOrOffset) + ", we get "+stringOf(E1p));
        console.log("E1Ctxp: "+stringOf(E1Ctxp));
      }
      return cloneOf(E1p,  U.subAction,  E1Ctxp);
    }
    if(isReuse(U)) {
      if(isReuse(E)) {
        printDebug("Prepending Reuse(...)")
        let childrenReuse = mapChildren(U.childEditActions, (k, c) => {
          printDebug("Inside Reuse({", k, ": ...})")
          return Down(k, cloneOf(childIfReuse(E, k), childIfReuse(U, k), Up(k, AddContext(k, E, ECtx))));
        });
        return New(childrenReuse, E.model);
      }
      // Here we are reusing something that was overwritten, so we can just gather all edits made on this context.
      let finalCloneEdit = identity;
      forEach(U.childEditActions, (subU, k) => {
        finalCloneEdit = merge(finalCloneEdit, cloneOf(E, subU, ECtx));
      });
      return finalCloneEdit;
    }
    if(isNew(U)) {
      printDebug("Prepending New(...)")
      let newChildren = mapChildren(U.childEditActions, (k, c) => {
        printDebug("Inside New({", k, ": ...})")
        return cloneOf(E, childIfNew(U, k), ECtx);
      });
      return rawIfPossible(New(newChildren, U.model), wasRaw);
    }
    if(U.ctor == Type.Clone) {
      return Clone(cloneOf(E, U.subAction, ECtx));
    }
    throw "TODO CloneOf when U is Concat, Replace, Append, Prepend"
  }
  
  /* Returns [e', subs] where
     e' is an edit built from U suitable to apply on the given context.
     subs are the sub back-propagation problems to solve and merge to the final result
  */
  /** Specification:
    Assuming apply(E, r, rCtx) is defined,
    Assuming apply(U, apply(E, r, rCtx), apply(ECtx, r, rCtx)) is defined,
    
    partitionEdit returns a quadruplet [E', sub, ECtx', outCount']
    such that:
    apply(prefixReuse(pathAT(ECtx'), E'), firstRecord(r, rCtx)) is correctly defined.
    and the record at the context of E' has length outCount' if defined.
    
    and sub are well-defined backPropagate problems.
  */
  function partitionEdit(E, U, ECtx, outCountU) {
    printDebug("partitionEdit", E, "<=", U, "-|", ECtx, outCountU);
    let UWasRaw = false, EWasRaw = false;
    if(!isEditAction(U)) {
      UWasRaw = true;
      U = New(U);
    }
    if(!isEditAction(E)) {
      EWasRaw = true;
      E = New(E);
    }
    if(U.ctor == Type.Up) {
      if(ECtx === undefined) {
        console.trace("/!\\ Error, trying to go up " + keyOrOffsetToString(U.keyOrOffset) + " but empty context");
      }
      if(ECtx.ctor == Type.Up || ECtx.ctor == Type.Down) {
        let newECtx = ECtx.subAction;
        if(editActions.__debug) {
          console.log("Pre-pending " + (ECtx.ctor == Type.Up ? "Up" : "Down") + "(" + keyOrOffsetToString(ECtx.keyOrOffset) + ", |)");
        }
        let [solution, next, ECtxInit2, outCountSol] = partitionEdit(E, U, newECtx, outCountU)
        if(ECtx.ctor == Type.Up) {
          return [Up(ECtx.keyOrOffset, solution), next, ECtx, outCountSol];
        }
        if(ECtx.ctor == Type.Down) {
          return [Down(ECtx.keyOrOffset, solution), next, ECtx, outCountSol];
        }
      }
      let [E1p, E1Ctxp, newSecondUpOffset] = walkUpActionCtx(U.keyOrOffset, E, ECtx);
      return partitionEdit(E1p, newSecondUpOffset ? Up(newSecondUpOffset, U.subAction) : U.subAction, E1Ctxp, outCountU);
    }
    if(U.ctor == Type.Down) {
      if(isReuse(E) && isKey(U.keyOrOffset)) {
        let [ESol, next, newEctx, outCountp] = partitionEdit(childIfReuse(E, U.keyOrOffset), U.subAction, Up(U.keyOrOffset, AddContext(U.keyOrOffset, E, ECtx)), outCountU);
        return [Down(U.keyOrOffset, ESol), next, ECtx, outCountp];
      }
      // We used to walk E with the offset and key, and hope that when U is Reuse(), we just keep E. 
      let [E1p, E1Ctxp] = walkDownActionCtx(U.keyOrOffset, E, ECtx, U.isRemove);
      if(editActions.__debug) {
        console.log("After walking down " + keyOrOffsetToString(U.keyOrOffset) + ", we get "+stringOf(E1p));
        console.log("E1Ctxp: "+stringOf(E1Ctxp));
      }
      return partitionEdit(E1p,  U.subAction,  E1Ctxp, outCountU);
    }
    if(U.ctor == Type.Clone) {
      return [Clone(cloneOf(E, U.subAction, ECtx)), []];
    }
    if(isReuse(U) || isReplace(U)) { // We need to return Reuse in context, so we navigate E to the correct location.
      if(E.ctor == Type.Up) {
        let [sol, nexts, newCtx, outCountUbis] = partitionEdit(E.subAction, U, Down(E.keyOrOffset, ECtx), outCountU);
        //print("Up-Compare with ", prevResult);
        return [Up(E.keyOrOffset, sol), nexts, ECtx, outCountUbis];
      }
      if(E.ctor == Type.Down) {
        let [sol, nexts, newCtx, outCountU2] = partitionEdit(E.subAction, U, Up(E.keyOrOffset, ECtx), outCountU);
        return [Down(E.keyOrOffset, sol), nexts, ECtx, outCountU2];
      }
    }
    if(isReuse(U) && !U.model.create) {
      if(E.ctor == Type.New) {
        if(isReuse(E) && !E.model.create) {
          return [Reuse(), [[E, U, ECtx, outCountU]], ECtx, outCountU];
        }
        let o = {};
        let finalNexts = [];
        for(let k in E.childEditActions) {
          let [sol, nexts, newCtx, outCountUbis] = partitionEdit(E.childEditActions[k], U, ECtx, outCountU);
          o[k] = sol;
          finalNexts.push(...nexts);
        }
        //print("New-Compare with ", prevResult, "EWasRaw", EWasRaw);
        return [rawIfPossible(New(o, E.model), EWasRaw), finalNexts, ECtx, outCountU];
      }
      if(E.ctor == Type.Concat) {
        //print("Concat-PartitionEdit: E,U,ECtx", E, U, ECtx)
        //print("Concat-PartitionEdit-Left");
        let [newU, newUCount] = offsetIn(Offset(0, E.count), U, false, true, outCountU);
        let [left, nextsLeft, newCtxLeft, outCountU1] = partitionEdit(E.first, newU, AddContext(Offset(0, E.count), E, ECtx), newUCount);
        //print("Concat-PartitionEdit-Right")
        let [newURight, newUCountRight] = offsetIn(Offset(E.count), U, false, true, outCountU);
        let [right, nextsRight, newCtxRight, outCountU2] = partitionEdit(E.second,
          newURight,
          AddContext(Offset(E.count), E, ECtx), newUCountRight);
        //print("Concat-Compare with ", prevResult);
        return [Concat(E.count, left, right, E.replaceCount, E.firstReuse, E.secondReuse),
          nextsLeft.concat(nextsRight),
          ECtx, outCountU
        ];
      }
      return [E, [], ECtx, outCountU];
    }
    if(U.ctor == Type.New) {
      let o = {};
      let finalNexts= [];
      for(let k in U.childEditActions) {
        if(editActions.__debug) {
          console.log("Pre-pending New({..."+k+": | })");
        }
        let [subK, nexts, outCtx, outCountX] = partitionEdit(E, U.childEditActions[k], ECtx, undefined);
        o[k] = subK;
        finalNexts.push(...nexts);
      }
      return [rawIfPossible(New(o, U.model), UWasRaw), finalNexts, ECtx, outCountU];
    }
    if(U.ctor == Type.Custom) {
      return [U, [], ECtx, outCountU];
    }
    if(U.ctor == Type.Concat) {
      // Even replaces, we treat them like Concat when we try to resolve partitionEdit. At this point, we are already creating something new from old pieces.
      /*let [inCount, outCount, left, right] = argumentsIfReplace(U);
      if(right != undefined) {
        return [Reuse(), [[E, U, ECtx]], ECtx];
      }*/
      // Unless there is a zero out length
      if(editActions.__debug && U.count > 0) {
        console.log("Pre-pending Concat("+U.count+", ... , |)");
      }
      let [F2, next2, F2Ctx, outCountF2] = partitionEdit(E, U.second, ECtx, MinusUndefined(outCountU, U.count));
      if(U.count == 0) { // We don't bother about building first element.
        return [F2, next2, ECtx, outCountU];
      }
      if(editActions.__debug) {
        console.log("Inside Concat("+U.count+", | , [done])");
      }
      let [F1, next1, F1Ctx, outCountF1] = partitionEdit(E, U.first, ECtx, U.count);
      
      return [Concat(U.count, F1, F2, U.replaceCount, U.firstReuse, U.secondReuse), next1.concat(next2), ECtx, outCountU];
    }
    throw "Case not supported in partitionEdit: " + stringOf(U);
  }
  editActions.partitionEdit = partitionEdit;
  
  // Extract the Up-only path of an action context.
  function pathAt(ctx) {
    if(typeof ctx == "object") {
      if(ctx.ctor == Type.Up) {
        return Up(ctx.keyOrOffset, pathAt(ctx.subAction))
      } else if(ctx.ctor == Type.Down) {
        return Down(ctx.keyOrOffset, pathAt(ctx.subAction))
      } else {
        return pathAt(ctx.tl);
      }
    } else {
      return Reuse();
    }
  }
  
  // Converts an edit action relative to the ECtx to a edit action that can apply on the top-level.
  /** Specifically:
  
  */
  function prefixReuse(ctx, U, outCountU) {
    let p = pathAt(ctx);
    printDebug("Building a solution with path ", p, U, outCountU);
    // First, build a path out of all the relative paths
    // Then, apply this path
    return ReuseUp(p, U, outCountU);
  }
  editActions.prefixReuse = prefixReuse;
  
  /** Specifications:
    Assuming apply(E, r, rCtx) is defined, and
    apply(U, apply(E, r, rCtx), apply(ECtx, r, rCtx)) is defined and has length outCountU if it's an array,
    
    then apply(backPropagate(E, U, ECtx), firstRecord(r, rCtx)) is defined,
    
    where
    
    firstRecord(r, []) = r
    firstRecord(_, (k, r)::ctx) = firstRecord(r, ctx);
  */
  function backPropagate(E, U, ECtx = undefined, outCountU = undefined) {
    var sm = new StateMachine();
    function backPropagateAux(E, U, ECtx = undefined, outCountU = undefined) {
      return sm.compute({E, U, ECtx, outCountU});
    }
    backPropagateAux(E, U, ECtx, outCountU);
    sm.execute(({E, U, ECtx, outCountU}) => {
    
    let wasRaw = false, Uraw = U;
    // E and U are edit actions or raw records/scalars
    if(!isEditAction(U)) {
      U = New(U);
      wasRaw = true;
    }
    if(!isEditAction(E)) {
      E = New(E);
    }
    // E and U are edit actions
    printDebug("backPropagate", E, "<=", U, "-|", ECtx, outCountU);
    // E is Up, Down(RemoveExcept), New(Extend,Const), Concat(Pure,Prepend,Append,Replace), Custom, Choose
    // U is Up, Down(RemoveExcept), New(Extend,Const), Concat(Pure,Prepend,Append,Replace), Custom, Choose
    if(U.ctor == Type.Choose && (E.ctor != Type.Custom || !E.lens.single)) {
      /** Proof:
        Assuming that apply(E, r, rCtx) is defined,
        Assuming that apply(Choose(subActions), apply(E, r, rCtx), apply(ECtx, r, rCtx)) is defined, which is equal to:
        apply(subActions[i], apply(E, r, rCtx), apply(ECtx, r, rCtx)) for some i.
        by induction,
        apply(backPropagate(E, subAction[i], ECtx), r, rCtx) is defined
        Since this is true for any i, it is true for the Choose and thus
        apply(Choose(backPropagate(E, subAction[i], ECtx))_i, r, rCtx) is defined
        QED;
      */
      return Choose(...Collection.map(U.subActions, childU => backPropagate(E, childU, ECtx, outCountU)));
    }
    if(E.ctor == Type.Custom) {
      // If E.lens.single is false, then U can be a Choose so that it can handle and merge similar alternatives
      /**
      update : function(edit, oldInput, oldOutput) {
        return X(edit, oldInput, oldOutput);
      }
      in a lens is the same as
      backPropagate: function(bp, edit, oldInput, oldOutput, E, Ctx) {
        return bp(E, X(edit, oldInput, oldOutput), Ctx)
      }
      */
      if("update" in E.lens) {
        let newU = E.lens.update(Uraw, E.lens.cachedInput, E.lens.cachedOutput);
        /** Proof:
           apply(Lens (ap, up) ESub, r, rCtx) is defined
           = ap(apply(ESub, r, rCtx)) and thus apply(ESub, r, rCtx) is defined.
           apply(U, apply(Lens (ap, up) ESub, r, rCtx), apply(ECtx, r, rCtx)) is defined,
           = apply(U, ap(apply(ESub, r, rCtx)), apply(ECtx, r, rCtx)) is defined.
           Thus,
           apply(update(U), apply(ESub, r, rCtx), apply(ECtx, r, rCtx)) is defined.
           By induction,
           Thus, apply(backPropagate(ESub, update(U), ECtx); r, rCtx) is defined.
           = apply(backPropagate(E, U, ECtx), r, rCtx)
           QED;
        */
        return backPropagate(E.subAction, newU, ECtx, undefined);
      } else {
        return E.lens.backPropagate(Uraw, E.lens.cachedInput, E.lens.cachedOutput, E.subAction, ECtx, outCountU);
      }
    }
    // Todo: Maybe move it later? Think about it.
    if(U.ctor == Type.Choose) {
      /** Proof: same as above for the Choose case */
      return Choose(Collection.map(U.subActions, childU => backPropagate(E, childU, ECtx, outCountU)));
    }
    if(E.ctor == Type.Choose) { // When the edit step itself is ambiguous (e.g.)
      /** Proof:
        Assuming that apply(E, r, rCtx) is defined,
        Assuming that apply(Choose(subActions), apply(E, r, rCtx), apply(ECtx, r, rCtx)) is defined, which is equal to:
        apply(subActions[i], apply(E, r, rCtx), apply(ECtx, r, rCtx)) for some i.
        by induction,
        apply(backPropagate(E, subAction[i], ECtx), r, rCtx) is defined
        Since this is true for any i, it is true for the Choose and thus
        apply(Choose(backPropagate(E, subAction[i], ECtx))_i, r, rCtx) is defined
        QED;
      */
      return Choose(Collection.map(E.subActions, childE => backPropagate(childE, Uraw, ECtx, outCountU)));
    }
    // E is Up, Down(RemoveExcept), New(Extend,Const), Concat(Pure,Prepend,Append,Replace)
    // U is Up, Down(RemoveExcept), New(Extend,Const), Concat(Pure,Prepend,Append,Replace), Custom
    // From now on, we decompose the back-propagation problem into multiple sub-problems,
    // possibly emiting one intermediate solution
    /** Specification: subProblems consists of either sub-problems or solutions to the back-propagate problems.
      Sub-problems have the form [subE, subU, subECtx, subOutCountU] and satisfy backPropagate pre-condition on r, rctx
      Solutions are such that apply(solution, firstRecord(r, rCtx)) is valid*/
    let subProblems = [];
    if(E.ctor == Type.Down) {
      /** Proof:
        Since we assume apply(Down(ko, subAction), r, rCtx) is defined, it implies that
        apply(subAction, r[ko], (ko, r)::rCtx) is defined
        
        Since we assume that apply(U, apply(Down(ko, subAction), r, rCtx), apply(ECtx, r, rCtx)) is defined, it is equal to:
        = apply(U, apply(subAction, r[ko], (ko, r)::rCtx), apply(Up(ko, ECtx), r[ko], (ko, r)::Ctx))
        is defined.
        Thus, by induction,
        
        apply(backPropagate(subAction, U, Up(ko, ECtx)), firstRecord(r[ko], (ko, r)::rCtx)) is defined
        = apply(backPropagate(subAction, U, Up(ko, ECtx)), firstRecord(r, rCtx))
        = apply(backPropagate(E, U, ECtx), firstRecord(r, rCtx))
        QED;
      */
      subProblems.push([E.subAction, Uraw, Up(E.keyOrOffset, ECtx), outCountU]);
    // E is Up, New(Extend,Const), Concat(Pure,Prepend,Append,Replace)
    // U is Up, Down(RemoveExcept), New(Extend,Const), Concat(Pure,Prepend,Append,Replace), Custom
    } else if(E.ctor == Type.Up) {
      /** Proof:
        Since we assume apply(Up(ko, subAction), r[ko], (ko, r)::rCtx) is defined, it implies that
        apply(subAction, r, rCtx) is defined
        
        Furthermore, we assume that apply(U, apply(Up(ko, subAction), r[ko], (ko, r)::rCtx), apply(ECtx, r[ko], (ko, r)::rCtx)) is defined, which is equal to:
        apply(U, apply(subAction, r, rCtx), apply(Down(ko, ECtx), r, rCtx))
        
        By induction, we obtain that
        apply(backPropagate(subAction, U, Down(ko, ECtx)), r, rCtx) is defined
        = apply(backPropagate(E, U, ECtx), r, rCtx)
        QED;
      */
      subProblems.push([E.subAction, Uraw, Down(E.keyOrOffset, ECtx), outCountU]);
      
    // E is New(Extend,Const), Concat(Pure,Prepend,Append,Replace)
    // U is Up, Down(RemoveExcept), New(Extend,Const), Concat(Pure,Prepend,Append,Replace), Custom
    } else if(isReuse(U)) {
      // We only need to solve for children
      /** Proof:
          Assume apply(E, r, rCtx) is defined hence, apply(E, r, rCtx)[f] is defined for every f,
          and apply(downAt(f, E), r, rCtx) is defined for every f.
          Assume apply(U, apply(E, r, rCtx), apply(ECtx, r, rCtx)) is defined
          The latest is equal to:
          apply(Reuse({f: Uf}_f), apply(E, r, rCtx), apply(ECtx, r, rCtx))
          = {f: applyZ(Uf, apply(E, r, rCtx)[f], (f, apply(E, r, rCtx))::apply(ECtx, r, rCtx))}_f
          = {f: applyZ(Uf, apply(downAt(f, E), r, rCtx), apply((f, E)::ECtx, r, rCtx))}_f
          Hence all these applyZ are defined, and thus
          
      */
      forEachChild(U, (child, k) => {
        let [Ep, ECtxp] = walkDownActionCtx(k, E, ECtx);
        subProblems.push([Ep, Up(k, child), ECtxp, undefined]);
      });
    // E is New(Extend,Const), Concat(Pure,Prepend,Append,Replace)
    // U is Up, Down(RemoveExcept), New(Const), Concat(Pure,Prepend,Append,Replace), Custom
    } else if(isReplace(U)) {
      let [inCount, outCount, left, right] = argumentsIfReplace(U);
      let [keepCount, keepSub] = argumentsIfReplaceIsKeep(inCount, outCount, left, right);
      //printDebug("keepSub", keepSub, keepSub !== undefined);
      if(keepSub === undefined) {
        let [ELeft, ECtxLeft] = walkDownActionCtx(Offset(0, inCount), E, ECtx);
        printDebug("ELeft:", ELeft);
        subProblems.push([ELeft, left, ECtxLeft, outCount]);
      }
      let [ERight, ECtxRight] = walkDownActionCtx(Offset(inCount), E, ECtx);
      printDebug("ERight:", ERight);
      subProblems.push([ERight, right, ECtxRight, MinUndefined(outCountU, outCount)]);
      //}
    // E is New(Extend,Const), Concat(Pure,Prepend,Append,Replace)
    // U is Up, Down(RemoveExcept), New(Const), Concat(Pure,Prepend,Append), Custom
    // Finished reusing cases. Now everything should create an intermediate solution.
    } else if(isConst(E)) {
      // Special cases New([Down(index)]). We can prepend and append before and after this index if it is relevant.
      if(isPrepend(U)) {
        printDebug("/!\\ Warning, cannot back-propagate a prepend on a New", E, U, "|-", ECtx);
        subProblems.push([E, U.second, ECtx, MinusUndefined(outCountU, U.count)]);
      } else if(isAppend(U)) {
        printDebug("/!\\ Warning, cannot back-propagate an append on a New", E, U, "|-", ECtx);
        subProblems.push([E, U.first, ECtx, U.count]);
      } else if(isRemoveExcept(U)) {
        printDebug("/!\\ Warning, cannot back-propagate a RemoveExcept on a New", E, U, "|-", ECtx);
        let [newE, newECtx] = walkDownActionCtx(U.keyOrOffset, E, ECtx);
        subProblems.push([newE, U.subAction, newECtx, outCountU]);
      } else /*if(isConst(U) || isUp(U) || isPureDown(U) || isPureConcat(U))*/ { // Partition fallback
        [s, probs, newECtx, outCount] = partitionEdit(E, Uraw, ECtx, outCountU);
        subProblems.push(prefixReuse(newECtx, s, outCount));
        subProblems.push(...probs);
      }
    // E is New(Extend), Concat(Pure,Prepend,Append,Replace)
    // U is Up, Down(RemoveExcept), New(Const), Concat(Pure,Prepend,Append), Custom
    } else if(isRemoveExcept(U)) {
      printDebug("RemoveExcept", U.keyOrOffset);
      let {count, newLength, oldLength} = U.keyOrOffset;
      if(count > 0) {
        if(isReuse(E)) {
          subProblems.push(prefixReuse(ECtx, Remove(count), undefined));
        } else {
          // E is a Concat. We should not walk the context there.
          if(E.ctor == Type.Concat) { // Always true.
            subProblems.push([E.first, RemoveExcept(count < E.count ? Offset(count/*, E.count - count*/) : Offset(0, 0)), AddContext(Offset(0, E.count), E, ECtx), 0]);
            if(E.count < count) {
              subProblems.push([E.second, RemoveExcept(Offset(count - E.count)), AddContext(Offset(E.count), E, ECtx), 0])
            }
          } else { // Impossible branch.
            print("Impossible branch - E should be a Reuse or a Concat", E);
            let [ELeft, ECtxLeft] = walkDownActionCtx(Offset(0, count), E, ECtx);
            subProblems.push([ELeft, Remove(count), ECtxLeft, 0]);
          }
        }
      }
      let [EMiddle, ECtxMiddle] = walkDownActionCtx(U.keyOrOffset, E, ECtx);
      subProblems.push([EMiddle, U.subAction, ECtxMiddle, outCountU]);
      if(newLength !== undefined) {
        if(isReuse(E)) {
          // If count + newLength is the length of available E, RemoveAll() is not defined.
          subProblems.push(prefixReuse(ECtx, Keep(count + newLength, RemoveAll())));
        } else if(count + newLength === 0) {
          if(E.ctor == Type.Concat) { // Always true.
            subProblems.push([E.first, RemoveAll(E.count), AddContext(Offset(0, E.count), E, ECtx), 0]);
            subProblems.push([E.second, RemoveAll(), AddContext(Offset(E.count), E, ECtx), 0]);
          }
        } else {
          let [ERight, ECtxRight] = walkDownActionCtx(Offset(count + newLength), E, ECtx);
          subProblems.push([ERight, RemoveAll(), ECtxRight, 0]);
        }
      }
    // E is New(Extend), Concat(Pure,Prepend,Append,Replace)
    // U is Up, Down, New(Const), Concat(Pure,Prepend,Append), Custom
    } else if(isConcat(E) && (isPrepend(U) || isAppend(U) || isReplace(U) || isReuse(U))) {
      // We try to splitIn U, so that we can have edits to the left and edits to the right.
      // U === Replace(E.count, outCount, left, right)
      let [outCount, left, right] = splitIn(E.count, U, outCountU);
      subProblems.push([E.first, left, AddContext(Offset(0, E.count), E, ECtx), outCount]);
      subProblems.push([E.second, right, AddContext(Offset(E.count), E, ECtx), MinusUndefined(outCountU, outCount)]);
    } else if(isPrepend(U)) {
      if(isConcat(E) && (!isReplace(E) || isTracableHere(E.first))) {
        // If E.first is a New, we don't want that. We would prefer to back-propagate on the second.
        let isFirstTracableHere = isTracableHere(E.first) || isReplace(E);
        let UPrepend = Prepend(U.count, U.first);
        let solutionPrepend = 
              isFirstTracableHere ?
                 backPropagate(E.first, UPrepend, AddContext(Offset(0, E.count), E, ECtx), U.count) :
                 backPropagate(E.second, UPrependPrepend(U.count, U.first), AddContext(Offset(E.count), E, ECtx), U.count);
        if(E.count == 0 && isFirstTracableHere && isTracableHere(E.second)) { // Two solutions that should not be merged.
          solutionPrepend = Choose(solutionPrepend,
            backPropagate(E.second, UPrepend, AddContext(Offset(E.count), E, ECtx), U.count));
        }
        subProblems.push(solutionPrepend);
        subProblems.push([E, U.second, ECtx, MinusUndefined(outCountU, U.count)]);
      } else { // E is Reuse or Replace. We emit the prepending at the current position.
        let [s, probs, newECtx] = partitionEdit(E, U.first, ECtx, U.count);
        // Now we prefix action with the Reuse and ReuseOffset from the context and call it a solution.
        let rightLength = MinusUndefined(outCountU, U.count);
        subProblems.push(prefixReuse(newECtx, Prepend(U.count, s), undefined)); // We don't know the length of this Prepend
        subProblems.push([E, U.second, ECtx, rightLength], ...probs);
      }
    // E is New(Extend), Concat(Pure,Prepend,Append,Replace)
    // U is Up, Down, New(Const), Concat(Pure,Append), Custom
    } else if(isAppend(U)) {
      if(isConcat(E) && (!isReplace(E) || isTracableHere(E.second))) {
        let isSecondTracableHere = isTracableHere(E.second) || isReplace(E);
        // TODO: There could be two solutions if we knew the length of E and it was the same as E.count
        subProblems.push([E, U.first, ECtx, U.count]);
        let UAppend = Append(MinusUndefined(U.count, E.count), U.second);
        if(isSecondTracableHere) {
          subProblems.push([E.second, UAppend, AddContext(Offset(E.count), E, ECtx), undefined]); // TODO: Can we find the length of U?
        } else {
          subProblems.push([E.first, UAppend, AddContext(Offset(0, E.count), E, ECtx), undefined]);
        }
      } else { // E is Reuse
        let [s, probs, newECtx,] = partitionEdit(E, U.second, ECtx);
        subProblems.push(prefixReuse(newECtx, Append(U.count, s))); // We don't know the length of this Append
        subProblems.push([E, U.first, ECtx, U.count], ...probs);
      }
      // Now we prefix action with the Reuse and ReuseOffset from the context and call it a solution.
    // E is New(Extend), Concat(Pure,Prepend,Append,Replace)
    // U is Up, Down, New(Const), Concat(Pure), Custom
    } else { // Only something to construct at this point, no reusing whatsoever.
    // At this point, we have New, Up, Down, and Concats.
      [s, probs, newECtx, outCount] = partitionEdit(E, Uraw, ECtx, outCountU);
      subProblems.push(prefixReuse(newECtx, s, outCount));
      subProblems.push(...probs);
    }
    // Now we prefix action with the Reuse and ReuseOffset from the context and call it a solution.
    printDebug("subProblems:", subProblems);
    let solution = identity;
    
    function handleOneSubProblem(solution, i) {
      if(i >= subProblems.length) return solution;
      subProblemOrSubSolution = subProblems[i];
      if(Array.isArray(subProblemOrSubSolution)) {
        let [subE, subU, subECtx, subOutCountU] = subProblemOrSubSolution;
        return backPropagateAux(subE, subU, subECtx, subOutCountU)(b => {
          solution = merge(solution, b);
          return handleOneSubProblem(solution, i+1);
        });
      } else {
        if(!isIdentity(subProblemOrSubSolution)) {
          printDebug("intermediate solution:", subProblemOrSubSolution);
        }
        solution = merge(solution, subProblemOrSubSolution);
        return handleOneSubProblem(solution, i+1);
      }
    }
    return handleOneSubProblem (solution, 0);
    }); // sn.execute
    return sm.getValue();
    /** Proof:
    apply(backPropagate(subE, subU, subECtx, subOutCountU), firstRecord(r, rCtx)) is defined for every f.
    Thus, the merge of all these backPropagate is correctly defined on firstRecord(r, rCtx) by the specification of merge.
    and therefore, apply(backPropagate(E, U, ECtx), firstRecord(r, rCtx)) is defined.
    QED;*/
  }
  editActions.backPropagate = backPropagate;
  
  // Computes the output length that a children of ChildEditActions would produce on original data
  function lengthOfArray(childEditActions, minLength) {
    printDebug("lengthOfArray", childEditActions, minLength);
    var i = 0;
    if(minLength === undefined) return undefined;
    forEach(childEditActions, (c, k) => {
      minLength = Math.max(minLength, k + 1);
    })
    return minLength;
  }
  
  // Computes the length that a given edit action would produce when it is applied on something of length inCount
  function outLength(editAction, inCount) {
    let result = undefined;
    let step = "compute";
    let inCountOriginal = inCount;
    let editActionOriginal = editAction;
    let stack = [[editAction, inCount, "compute"]];
    // non-recursive version to avoid stack overflow.
    // We also cache the output length.
    while(stack.length > 0) {
      let [editAction, inCount, step] = stack.pop();
      //console.log("while:"+uneval(editAction)+" inCount:"+inCount+" step:" + step);
      if(Array.isArray(editAction) || typeof editAction === "string") {
        result = editAction.length;
      } else if(typeof editAction !== "object") {
        result = undefined;
      } else if(!isEditAction(editAction)) {
        stacK.push([New(editAction), inCount, step]);
      } else if(editAction.ctor == Type.Choose) {
        stack.push([Collection.firstOrDefault(editAction.subActions, Reuse()), inCount, "compute"]);
      } else if(typeof editAction.cachedOutLength == "number") {
        result = editAction.cachedOutLength;
      } else if(editAction.ctor == Type.Concat) {
        if(step == "compute") {
          stack.push([editAction, inCount, "addCount"], [editAction.second, inCount, "compute"]);
        } else {// step == "addCount"
          result = PlusUndefined(result, editAction.count);
        }
      } else if(editAction.ctor == Type.New) {
        if(isReuse(editAction)) {
          if(inCount === undefined) {
            result = undefined;
          } else {
            result = lengthOfArray(editAction.childEditActions, inCount);
          }
        } else {
          if(typeof editAction.model.value === "string") {
            result = editAction.model.value.length;
          } else {
            result = lengthOfArray(editAction.childEditActions, 0);
          }
        }
      } else if(editAction.ctor == Type.Custom) {
        if(editAction.lens.cachedOutput === undefined) result = undefined;
        else {
          let m = monoidOf(editAction.lens.cachedOutput);
          result = m.length(editAction.lens.cachedOutput);
        }
      } else if(editAction.ctor == Type.Up) {
        let newLength = isOffset(editAction.keyOrOffset) ? editAction.keyOrOffset.oldLength : undefined;
        stack.push([editAction.subAction, newLength, "compute"]);
      } else if(editAction.ctor == Type.Down) {
        let newLength = isOffset(editAction.keyOrOffset) ? MinUndefined(editAction.keyOrOffset.newLength, MinusUndefined(inCount, editAction.keyOrOffset.count)) : undefined;
        stack.push([editAction.subAction, newLength, "compute"]);
      } else {
        console.trace("outLength invoked on unexpected input", editAction);
        return undefined;
      }
    }
    return result;
  }
  
  var bs = "\\\\";
  function toExpString(string, charDelim) {
    charDelim = charDelim == "\"" || charDelim == "`" || charDelim == "'" ? charDelim : "\"";
    return charDelim + string
          .replace(new RegExp(bs, "g"), bs)
          .replace(new RegExp(charDelim, "g"), "\\" + charDelim)
          .replace(new RegExp("\n", "g"), "\\n")
          .replace(new RegExp("\t", "g"), "\\t")
          + charDelim
  }
  function uneval(x, indent) {
    if(typeof x == "string") {
      return toExpString(x);
    }
    if(typeof x == "number" || typeof x == "boolean") {
      return x + "";
    }
    if(typeof x == "object" && x == null) {
      return "null";
    }
    if(typeof x == "object" && x.hasOwnProperty("toString")) {
      return x.toString();
    }
    if(typeof x == "object") {
      if(isEditAction(x)) {
        return addPadding(stringOf(x), indent || "");
      }
      if(isOffset(x)) {
        return keyOrOffsetToString(x);
      }
      var result = [];
      var isSmall = Object.keys(x).length <= 1;
      var newline = typeof indent == "undefined" || isSmall ? "" : "\n" + indent;
      var separator = newline + ", ";
      var newIndent = typeof indent == "undefined" ? indent : indent + "  ";
      if(Array.isArray(x)) { // Arrays
        for(var i = 0; i < x.length; i++) {
          result.push(uneval(x[i], newIndent));
        }
        return "[ " + result.join(separator) + "]";
      }
      for(var k in x) {
        result.push(k + ": " + (typeof x[k] == "object" ? newline + "  " : "") + uneval(x[k], newIndent));
      }
      return "{ " + result.join(separator) + "}";
    }
    return "" + x;
  }
  editActions.uneval = uneval;
 
  function baseNameFrom($string) {
    $string2 = $string.replace(/[^\\w_]/, "");
    if($string2 === "" || $string2[0].exec(/\d/)) $string2 = "s".$string2;
    $lenExtracted = Math.min(10, $string2.length);
    if($string[0] == "/" || $string[0] == "\\" || $string.substring(0, 2).toLowerCase == "c:") {
      $string3 = $string2.substring($string2.length - $lenExtracted, $string2.length);
    } else {
      $string3 = $string2.substring(0, $lenExtracted);
    }
    return $string3;
  }

  // PHP equivalent: echoEdit
  // Like uneval() but without indentation and concatenates everything.
  // Converts Prepend, Append, Replace, Keep to Concat
  // Converts Remove, RemoveExcept, RemoveAll, DropAfter, DropAll, DropExcept,... to Down.
  function serializeEdit($edit, $simplify = false) {
    $stack = [];
    $done = false;
    $rendering = "";
    $stringShortcut = {};
    $functionsDeclared = {};
    $beforeEdit = "";
    $result = "";
    while(!$done) {
      //console.log("stack", $stack, "\nedit", $edit, "\nrendering", $rendering);
      if($edit === null) {
        $result += "null";
        $done = true;
      } else if($edit === undefined) {
        $result += "undefined";
        $done = true;
      } else if(typeof $edit !== "object") {
        $rep = uneval($edit);
        if($rep in $stringShortcut) {
          $result += $stringShortcut[$rep];
        } else if($rep.length > 15 && $simplify) { // Abbreviate the scalar
          $base = baseNameFrom($rep);
          $i = "";
          while(($base+$i).toLowerCase() in $functionsDeclared[strtolower]) {
            if($i === "") $i = 1;
            $i++;
          }
          $funName = $base + $i;
          $functionsDeclared[($base+$i).toLowerCase()] = true;
          $stringShortcut[$rep] = $funName+"()";
          $beforeEdit += "function "+$funName+"() { return "+$rep+"; }\n";
          $result += $stringShortcut[$rep];
        } else {
          $result += $rep;
        }
        $done = true;
      } else if(!isEditAction($edit)) {
        $keys = Object.keys($edit);
        if($rendering === "") {
          $result += "{";
          if($keys.length === 0) {
            $result += "}";
            $done = true;
          } else {
            $result += JSON.stringify($keys[0]) + ":";
            $stack.push([$edit, 0]);
            $edit = $edit[$keys[0]];
            $rendering = "";
          }
        } else {
          $rendering++;
          if($rendering >= $keys.length) {
            $result +=  "}";
            $done = true;
          } else {
            $result += ","+ JSON.stringify($keys[$rendering]) + ":";
            $stack.push([$edit, $rendering]);
            $edit = $edit[$keys[$rendering]];
            $rendering = "";
          }
        }
      } else if($edit.ctor === Type.Down || $edit.ctor === Type.Up) {
        if($rendering !== "subAction") {
          $result +=  $edit.ctor === Type.Down ? ($edit.isRemove ? "RemoveExcept" : "Down") : "Up";
          $result +=  "("+ keyOrOffsetToString($edit.keyOrOffset);
          if(isIdentity($edit.subAction)) {
            $result +=  ")";
            $done = true;
          } else {
            $result +=  ",";
            $stack.push([$edit, "subAction"]);
            $edit = $edit.subAction;
            $rendering = "";
            continue;
          }
        } else {
          $result +=  ")";
          $done = true;
        }
      } else if($edit.ctor === Type.New) {
        if($rendering === "") {
          if($edit.model.ctor === TypeNewModel.Insert && (typeof $edit.model.value !== "object" || $edit.model.value == null)) {
            $edit = $edit.model.value;
            continue;
          }
          if($edit.model.ctor === TypeNewModel.Extend) {
            $result += "Extend(";
          } else {
            $result += "Create(";
          }
          $stack.push([$edit, "childEditActions"]);
          $edit = $edit.childEditActions;
          $rendering = "";
        } else {
          $result += ")";
          $done = true;
        }
      } else if($edit.ctor === Type.Custom) {
        if($rendering === "") {
          $result += "Custom(";
          $stack.push([$edit, "subAction"]);
          $edit = $edit.subAction;
          $rendering = "";
        } else if($rendering === "subAction") {
          $result += ", ";
          $stack.push([$edit, "name"]);
          $edit = $edit.lens.name;
          $rendering = "";
        } else {
          $result += ")";
          $done = true;
        }
      } else if($edit.ctor === Type.Concat) {
        if($rendering === "") {
          if($edit.count === 0) {
            $edit = $edit.second;
            continue;
          }
          $result += "Concat";
          $result += "("+ $edit.count+ ",";
          $stack.push([$edit, "first"]);
          $edit = $edit.first;
          $rendering = "";
        } else if($rendering === "first") {
          $result +=  ",";
          $stack.push([$edit, "second"]);
          $edit = $edit.second;
          $rendering = "";
        } else {
          if($edit.replaceCount !== undefined) {
            $result += ", " + $edit.replaceCount;
          } else if($edit.firstReuse) {
            $result += ", undefined, true";
          } else if($edit.secondReuse) {
            $result += ", undefined, false, true";
          }
          $result +=  ")";
          $done = true;
        }
      } else {
        console.log($edit);
        $result += "Unknown " + (typeof $edit);
      }
      if($done && $stack.length > 0) {
        [$edit, $rendering] = $stack.pop();
        $done = false;
      }
    }
    return $beforeEdit + $result;
  }
  editActions.serializeEdit = serializeEdit;
  function serializeWithoutStack(edit) {
    $i = 0;
    $stack = [];
    $result = "(function() { let x = StartArray();";
    while(!isIdentity(edit)) {
      //print(edit);
      let [keepCount, keepSub]  = transform.extractKeep(edit);
      if(keepSub !== undefined) {
        $result += " x.Keep(" + keepCount + ");";
        edit = keepSub;
        continue;
      }
      if(edit.ctor === Type.Down) {
        if(edit.isRemove) {
          if(edit.keyOrOffset.newLength === undefined) {
            $result += " x.Remove("+edit.keyOrOffset.count+");";
          } else {
            $result += " x.RemoveExcept("+keyOrOffsetToString(edit.keyOrOffset)+");";
          }
        } else {
          $result += " x.Down("+keyOrOffsetToString(edit.keyOrOffset)+");";
        }
        
        edit = edit.subAction;
        continue;
      }
      if(edit.ctor === Type.Concat) {
        if(edit.secondReuse) {
          $result += " x.Prepend(" + edit.count + "," + uneval(edit.first) + ");";
          edit = edit.second;
          continue;
        } else if(edit.replaceCount !== undefined) {
          $result += " x.Replace(" + edit.replaceCount + "," + edit.count + "," + uneval(Up(Interval(0, edit.replaceCount), edit.first)) + ");";
          edit = Up(Interval(edit.replaceCount), edit.second);
          continue;
        } else {
          $result += " x.Concat(" + edit.count + "," + uneval(edit.first) + ");";
          edit = edit.second;
          continue;
        }
      }
    }
    $result += " return x.EndArraySimplify(); })()";
    //console.log("result", $result);
    return $result;
  }
  editActions.serializeWithoutStack = serializeWithoutStack;
  function isSimpleChildClone(editAction) {
    return editAction.ctor == Type.Down && isIdentity(editAction.subAction) && isKey(editAction.keyOrOffset);
  }
  // Find all paths from complexVal to simpleVal if complexVal contains simpleVal, up to given depth
  /** Invariant: if x in allClonePaths_(complexVal, simpleVal, _)
       then for any ctx, apply(x, complexVal, ctx) = simpleVal
  */
  function allClonePaths_(complexVal, simpleVal, maxDepth) {
      //console.log("allClonePaths_", editActions.uneval({complexVal, simpleVal}));
      // We don't consider empty arrays to be clones.
      if(Array.isArray(simpleVal) && simpleVal.length == 0) return [];
      let simpleValStr = uneval(simpleVal);
      let complexValStr = uneval(complexVal);
      if(complexValStr.indexOf(simpleValStr) == -1) return [];
      if (complexValStr === simpleValStr) {
        /** Proof: apply(Reuse(), complexVal, ctx) = complexVal = simpleVal, QED. */
        return [Reuse()];
      }
      if(typeof maxDepth == "undefined" || maxDepth <= 0) return [];
      if (typeof complexVal == "object") {
          var results = [];
          let a = Array.isArray(complexVal);
          for (var k in complexVal) {
            k = a ? Number(k) : k;
            /** Proof: if x is in results, x is of the form Down(k, x')
                       where x' is in allClonePaths_(complexVal[k], simpleVal, _)
               Hence, for any ctx:
                 apply(x, complexVal, ctx)                      --> map effect
               = apply(Down(k, x'), complexVal, ctx)            --> APPLY-DOWN
               = apply(x', complexVal[k], (k, complexVal)::ctx) --> Induction
               = simpleVal
               QED;
            */
            results.push(...allClonePaths_(complexVal[k], simpleVal, maxDepth - 1)
                .map(function (p) {
                  return Down(k, p);
              }));
          }
          //if(paths.length > 0) console.log("found one:", paths);
          return results;
      }
      return [];
  }
  
  // Function to override if bam is used e.g. to compare tagged arrays where tags are not interchangeable.
  // For example, 
  // return isRichText_(newVal) && isRichText_(oldVal) || isElement_(newVal) && isElement_(oldVal) && newVal[0] == oldVal[0] || !isRichText_(newVal) && !isRichText_(oldVal) && !isElement_(newVal) && !isElement_(oldVal) && Array.isArray(oldVal) == Array.isArray(newVal)
  isCompatibleForReuseObjectDefault = function(oldVal, newVal) {
    return !Array.isArray(oldVal) || !Array.isArray(newVal);
  };
  isCompatibleForReplaceDefault = function(oldVal, newVal) {
    return true;
  }
  
  // options: { onlyReuse: If set to true, if it finds the element somewhere else, it will not provide the edit action to create element from scratch }

  // invariant if defined.
  // apply(diff(oldVal, newVal, oldValCtx), oldVal, oldValCtx) = newVal
  editActions.diff = function editDiff(oldVal, newVal, options, oldValCtx) {
    // TODO: include the context while computing diffs to recover sibling clones.
    if(editActions.__debug) console.log("editDiff\n  "+uneval(oldVal, "  ")+"\n- "+uneval(newVal, "  ") + "\n-| " + uneval(oldValCtx));
    let o = typeof oldVal;
    let n = typeof newVal;
    options = {maxCloneUp: 2, maxCloneDown: 2, isCompatibleForReuseObject: isCompatibleForReuseObjectDefault, isCompatibleForReplace: isCompatibleForReplaceDefault, ...options};
    if(o == "function" || n == "function") {
      console.log("/!\\ Warning, trying to diff functions. Returning Reuse()", oldVal, newVal);
      return Reuse(); // Cannot diff functions
    }
    
    // Considers the newVal as a thing to completely replace the old val.
    // Specification: apply(newObjectDiffs(), oldVal, oldValCtx) = newVal
    function newObjectDiffs() {
      printDebug("newObjectDiffs", oldVal, newVal);
      let childDiffs = {};
      let isArray = Array.isArray(newVal);
      let model = isArray ? [] : {};
      let lastClosestOffset = 0;
      for(var key in newVal) {
        if(typeof oldVal == "object" && lastClosestOffset == 0 &&
           editActions.uneval(oldVal[key]) == editActions.uneval(newVal[key])) {
          // Same key, we try not to find fancy diffs with it.
          childDiffs[key] = Down(numIfPossible(key));
        } else {
          // Diff the old value against the child of newValue at index key.
          let cd = editDiff(oldVal, newVal[key], options, oldValCtx);
          printDebug("cd", cd);
          // Here we can assumbe by induction that
          // apply(cd, oldVal, oldValCtx) = newVal[key]
          if(cd.ctor == Type.Choose) { // Only filter and sorting here.
            let onlySimpleChildClones = Collection.filter(cd.subActions,
              subAction => isSimpleChildClone(subAction));
            if(!Collection.isEmpty(onlySimpleChildClones)) {
              // Here we should remove everything else which is not a clone, as we are just moving children around the object.
              if(isArray) {
                // Furthermore, for an array, we sort the clones according to which key is the closest.
                onlySimpleChildClones = [...onlySimpleChildClones];
                let nKey = Number(key);
                onlySimpleChildClones.sort(function(d1, d2) {
                  return Math.abs(Number(d1.keyOrOffset) - nKey - lastClosestOffset) -
                         Math.abs(Number(d2.keyOrOffset) - nKey - lastClosestOffset);
                });
                lastClosestOffset = Number(onlySimpleChildClones[0].keyOrOffset) - nKey;
              }
              printDebug(onlySimpleChildClones);
              cd = Choose(onlySimpleChildClones);
            }
          }
          childDiffs[key] = cd;
        }
      }
      /** Proof:
          apply(New({f: key_f }^(f in Keys(newVal)), model), oldVal, oldValCtx)  
        = {f: apply(key_f, oldVal, oldValCtx)}^(f in Keys(newVal))    --> induction
        = {f: newVal[f]}^(f in Keys(newVal))
        = newVal;
        
        if(key_f is Down(f)), then we get oldVal[f], which by path condition is also newVal[f].
        QED;
      */
      return New(childDiffs, model)
    }
    
    /** Assumes that for every x in diffs, apply(x, oldVal, oldValCtx) == newVal.
        Returns one x such that apply(x, oldVal, oldValCtx) == newVal
        If options are not set to only Reuse whenever possible, will add the newObjectDiffs();
        */
    function addNewObjectDiffs(diffs) {
      printDebug("addNewObjectDiffs", diffs);
      if(diffs.length && options.onlyReuse) {
        return Choose(diffs);
      }
      diffs.push(newObjectDiffs());
      return Choose(diffs);
    }
    // Get all possibles contextual clones that could have produced newVal.
    /** Invariant: if x in ctxClone(_, oldVal, oldValCtx), then
        apply(x, oldVal, oldValCtx) = newVal
    */
    function ctxClones(maxDepth, oldVal, oldValCtx) {
      let clonePaths = allClonePaths_(oldVal, newVal, options.maxCloneDown);
      if(clonePaths.length > 0) {
        /** Proof: If x is in clonePaths, then apply(x, oldVal, oldValCtx) == newVal
            by the definition of allClonePaths_ */
        return clonePaths;
      }
      if(oldValCtx && maxDepth > 0) {
        /** Proof:
            Assume oldValCtx = (k, o2)::ctx'
            
            If x is in result, then x is of the form Up(k, x')
            and x' is in ctxClones(o2, ctx');
            Thus, by induction,
            apply(x, oldVal, oldValCtx)                --> Definition of program
            = apply(Up(k, x'), oldVal, (k, o2)::ctx')  --> APPLY-UP
            = apply(x', o2, ctx')                      --> induction
            = newVal
            QED;*/
        return ctxClones(maxDepth-1, oldValCtx.hd.prog, oldValCtx.tl).map(
           x => Up(oldValCtx.hd.keyOrOffset, x)
        );
      }
      return [];
    }
    
    let diffs = [];
    if(o == "number" || o == "boolean" || o == "string" || o == "undefined") {
      if(n == "number" || n == "boolean" || n == "string" || n == "undefined") {
        if(oldVal === newVal) {
          /** Proof:
            apply(Reuse(), oldVal, oldValCtx) = oldVal = newVal.
            QED;
          */
          diffs.push(Reuse());
        } else {
          /** Proof:
            apply(ctxClones(options.maxCloneUp, oldVal, oldValCtx), oldVal, oldValCtx) = oldVal = newVal.
            QED;
          */
          diffs = diffs.concat(ctxClones(options.maxCloneUp, oldVal, oldValCtx));
          if(diffs.length == 0 || !options.onlyReuse) {
            if(n == "string" && o == "string") {
              /** Proof: 
                 apply(eaStrDiff(oldVal, newVal), oldVal, oldValCtx) = newVal
                 QED;
               */
              diffs.push(eaStrDiff(oldVal, newVal, true));
            } else {
              /** Proof: 
                 apply(New(newVal), oldVal, oldValCtx) = newVal  -- New definition
                 QED;
               */
              diffs.push(New(newVal));
            }
          }
        }
        return Choose(...diffs);
      } else if(n == "object" ) { // maybe the number was included in the object/array
        return addNewObjectDiffs(diffs);
      }
      throw "Unsupported newVal: " + uneval(newVal);
    } else if(o == "object") {
      if(n == "number" || n == "string" || n == "boolean") {
        // It could have been cloned from one of the object's descendent.
        diffs = diffs.concat(ctxClones(options.maxCloneUp, oldVal, oldValCtx));
        if(diffs.length == 0 || !options.onlyReuse) {
          diffs.push(New(newVal));
        }
        // WISH: Sort diffs according to relevance
        return Choose(...diffs);
      } else if(n == "object") {
        // It might be possible that objects are also wrapped or unwrapped from other objects, e.g.
        // n: ["img", {}, []] ->
        // o: ["p", {}, ["img", {}, []]];
        // We want to detect that and avoid abusive reuse
        let diffs = [];
        let sameKeys = uneval(Object.keys(newVal)) == uneval(Object.keys(oldVal));
        if(sameKeys && options.isCompatibleForReuseObject(oldVal, newVal)) { // Check if they are compatible for reuse. Treats like tuple.
          let childEditActions = {};
          for(let k in oldVal) {
            let oldValChild = oldVal[k];
            let newValChild = newVal[k];
            childEditActions[k] = editDiff(oldValChild, newValChild, options, cons(ContextElem(k, oldVal), oldValCtx));
          }
          diffs.push(Reuse(childEditActions));
        }
        // Ensures sep has an odd length
        function makeNotFoundIn(sep, str) {
          let j;
          while((j = str.indexOf(sep)) >= 0) {
            let nextCharToAvoid = str.length <= j + sep.length + 1 ? str.substring(j + sep.length, j + sep.length + 1) : "#";
            sep = sep + (nextCharToAvoid == "#" ? "__" : "##");
          }
          return sep;
        }
        // diff the array or the string
        if(Array.isArray(oldVal) && Array.isArray(newVal) && options.isCompatibleForReplace(oldVal, newVal)) {
          // We are going to cheat and compare string diffs.
          let sep = "#"; // A very small string not found in oldVal or newVal
          let newValStr, oldValStr, newValStrElems, oldValStrElems;
          while(true) {
            newValStr = newVal.map(x => uneval(x)).join(sep);
            newValStrElems = newValStr.split(sep);
            oldValStr = oldVal.map(x => uneval(x)).join(sep);
            oldValStrElems = oldValStr.split(sep);
            if(oldValStrElems.length != oldVal.length && oldVal.length >= 1 || newValStrElems.length != newVal.length && newVal.length >= 1 ) {
              sep = makeNotFoundIn(sep, newValStr);
              sep = makeNotFoundIn(sep, oldValStr);
              continue;
            } else {
              if(newVal.length == 0) newValStrElems = [];
              if(oldVal.length == 0) oldValStrElems = [];
              break;
            }
          }
          if(newValStr == oldValStr) return Reuse();
          let newValStrUneval = "[ " + newValStrElems.join(", ") + "]";
          let oldValStrUneval = "[ " + oldValStrElems.join(", ") + "]";
          printDebug("oldValStrUneval", oldValStrUneval);
          printDebug("newValStrUneval", newValStrUneval);
          if(newValStrUneval.indexOf(oldValStrUneval) >= 0) {
            printDebug("Pure wrapping");
            // Oh, a pure wrapping!
            diffs.push(newObjectDiffs());
            if(diffs.length > 0 && options.onlyReuse) {
              return Choose(diffs);
            }
          } else if(oldValStrUneval.indexOf(newValStrUneval) >= 0) {
            printDebug("Pure unwrapping");
            // Oh a pure unwrapping!
            diffs.push(...allClonePaths_(oldVal, newVal, options.maxCloneDown));
            if(diffs.length > 0 && options.onlyReuse) {
              return Choose(diffs);
            }
          }
          
          // Ok, so now we have the two strings. Let's diff them and see where the replaces are.
          let strEdit = strDiff(oldValStr, newValStr);
          // We traverse strEdit until we find a place that we can both identify in oldVal and newVal.
          // [["p", "test"],##"d",##"blih",##"mk"]
          // ===i=====R===i===i========R==DDDDDDD=
          // [["x", ["p", "tast"]],##["i", "hello"],##"d",##"blah"]
          // ===IIIIII======R===I====IIIIIIIIIIIIIIIII=========R==d

          // [["p", "test"],##"d",##"blih"##"mk"]
          // ===i=====R===i=i==========R==DDDDDD=
          // [["x", ["p", "tast"]],##["i", "hello"],##"d",##"blah"]
          // ===IIIIII======R===I=IIIIIIIIIIIIIIIII===========R==d
          // The string actually finds where separators are moved... if the separator is small enough.
          //function toReplaces(strEdit, newElemsStr, oldElemsStr, sep) {
          // Algorithm:
          // We tag elements from newElemsStr and oldElemsStr with the number of prepends and deletions inside them.
          // when new and old cross a separator together, we mark the mapping.
          // At the end, around every removed separator, we choose which element was removed according to the one having the most deletions.
          // 
          let indexNew = 0; // Incremented after a separator.
          let indexOld = 0;
          let index = 0;
          let newIsSep = false;
          let oldIsSep = false;
          let oldActions = oldValStrElems.map(x =>
            ({removed: 0, kept: 0, str: x, isRemoved: false}));
          let newActions = newValStrElems.map(x =>
            ({inserted: 0, kept: 0, str: x, isInserted: false}));
          let oldSeps = oldValStrElems.slice(1).map(x => 
            ({removed: 0, kept: 0, str: sep, isRemoved: false}))
          let newSeps = newValStrElems.slice(1).map(x => 
            ({inserted: 0, kept: 0, str: sep, isInserted: false}));
          function unlabelledLength(entry, count) {
            return Math.min(entry.str.length - ("inserted" in entry ? entry.inserted : 0) - ("removed" in entry ? entry.removed : 0) - entry.kept, count);
          }
          function recordLength(array, index, count, name) {
            let toInsert = unlabelledLength(array[index], count);
            array[index][name] += toInsert;
            count = count - toInsert;
            return count;
          }
          function handleLength(count, newIsSep, indexNew, newActions, newSeps, label) {
            if(newIsSep) {
              count = recordLength(newSeps, indexNew, count, label);
              if(count > 0) {
                newIsSep = false;
                indexNew++;
                return handleLength(count, newIsSep, indexNew, newActions, newSeps, label);
              }
            } else {
              count = recordLength(newActions, indexNew, count, label);
              if(count > 0) {
                newIsSep = true;
                return handleLength(count, newIsSep, indexNew, newActions, newSeps, label);
              }
            }
            return [newIsSep, indexNew];
          }
          while(0 <= index && index < strEdit.length) {
            let s = strEdit[index];
            switch(s[0]) {
              case DIFF_INSERT:// We were already at the end, we can just say "New"
                [newIsSep, indexNew] = handleLength(s[1].length, newIsSep, indexNew, newActions, newSeps, "inserted");
                index += 1;
                break;
              case DIFF_DELETE: // We were already at the deletion position
                [oldIsSep, indexOld] = handleLength(s[1].length, oldIsSep, indexOld, oldActions, oldSeps, "removed");
                index += 1;
                break;
              case DIFF_EQUAL: 
              default:
                [newIsSep, indexNew] = handleLength(s[1].length, newIsSep, indexNew, newActions, newSeps, "kept");
                [oldIsSep, indexOld] = handleLength(s[1].length, oldIsSep, indexOld, oldActions, oldSeps, "kept");
                index += 1;
                break;
            }
          }
          let aSepWasRemovedOrInserted = false;
          printDebug("oldActions", oldActions);
          printDebug("newActions", newActions);
          printDebug("oldSeps", oldSeps);
          printDebug("newSeps", newSeps);
          // Ok, now, the classification.
          for(let k in oldSeps) {
            let sep = oldSeps[k];
            if(sep.removed > sep.kept) { // sep has an odd length, there cannot be equality
              sep.isRemoved = true;
              aSepWasRemovedOrInserted = true;
              // We find the element nearby which is the most likely to be removed.
              let left = oldActions[k];
              let right = oldActions[Number(k) + 1];
              if(left.isRemoved) {
                right.isRemoved = true;
              } else if(right.isRemoved) {
                left.isRemoved = true;
              } else {
                let compareWithIndex = Number(k) + 1;
                while(compareWithIndex in oldSeps && oldSeps[compareWithIndex].removed > oldSeps[compareWithIndex].kept) {
                  compareWithIndex++;
                }
                let farRight = oldActions[compareWithIndex];
                let leftRatio = left.removed / (left.removed + left.kept + 1);
                let rightRatio = farRight.removed / (farRight.removed + farRight.kept + 1 );
                if(leftRatio > rightRatio) {
                  left.isRemoved = true;
                } else {
                  right.isRemoved = true;
                }
              }
            }
          }
          for(let k in newSeps) {
            k = Number(k);
            let sep = newSeps[k];
            if(sep.inserted > sep.kept) {
              sep.isInserted = true;
              aSepWasRemovedOrInserted = true;
              // We find the element nearby which is the most likely to be removed.
              let left = newActions[k];
              let right = newActions[Number(k) + 1];
              if(left.isInserted) {
                right.isInserted = true;
              } else if(right.isInserted) {
                left.isInserted = true;
              } else { // If the next separator is also inserted, that means that the data inside is inserted anyway.
                let compareWithIndex = Number(k) + 1;
                while(compareWithIndex in newSeps && newSeps[compareWithIndex].inserted > newSeps[compareWithIndex].kept) {
                  compareWithIndex++;
                }
                let farRight = newActions[compareWithIndex];
                let leftRatio = left.inserted / (left.inserted + left.kept + 1);
                let rightRatio = farRight.inserted / (farRight.inserted + farRight.kept + 1 );
                if(leftRatio > rightRatio) {
                  left.isInserted = true;
                } else {
                  right.isInserted = true;
                }
              }
            }
          }
          if(oldActions.length === 0) { // Everything was inserted.
            for(let index = 0; index < newActions.length; index++) {
              newActions[index].isInserted = true;
            }
            aSepWasRemovedOrInserted = newActions.length > 0;
          }
          if(newActions.length === 0) { // Everything was removed
            for(let index = 0; index < oldActions.length; index++) {
              oldActions[index].isRemoved = true;
            }
            aSepWasRemovedOrInserted = oldActions.length > 0;
          }
          if(!aSepWasRemovedOrInserted && newActions.length == oldActions.length) { // Alignment decided that elements are the same.
            let o = {};
            for(let index = 0; index < newActions.length; index++) {
              if(newValStrElems[index] != oldValStrElems[index]) {
                o[index] = editDiff(oldVal[index], newVal[index], options, AddContext(index, oldVal, oldValCtx))
              }
            }
            /** Proof:
                apply(Reuse({index: editDiff(oldVal[index], newVal[index], (index, oldVal)::oldValCtx)}^(index in Keys(newVal))),
                      oldVal, oldValCtx)
              = {index: 
                  apply(editDiff(oldVal[index], newVal[index], (index, oldVal)::oldValCtx),
                    oldVal[index], (index, oldVal)::oldValCtx)
                }^(index in Keys(newVal))  -- editDiff specification
              = {index: newVal[index]}^(index in Keys(newVal))
              = newVal
              QED;
            */
            diffs.push(Reuse(o));
          } else {
            // Ok, now newActions.isInserted and oldActions.isRemoved contains a consistent view of elements which were aligned or not.
            // For sub-edits we need to make sure contexts are up to date.
            // First pass: group edits into buckets; for each context, adapt the context.
            indexNew = 0;
            indexOld = 0;
            let acc = tail => tail;
            let tmpVal = oldVal;
            let tmpValStrElems = oldValStrElems;
            let tmpValCtx = oldValCtx;
            printDebug("oldActions", oldActions);
            printDebug("newActions", newActions);
            while(indexNew < newActions.length || indexOld < oldActions.length) {
              printDebug("tmpVal", tmpVal);
              printDebug("tmpValStrElems", tmpValStrElems);
              // Deletions
              let countRemoved = 0;
              while(indexOld < oldActions.length && oldActions[indexOld].isRemoved) {
                indexOld++;
                countRemoved++;
              }
              /**
                   acc1 = tail => tail
                   Remove(1, .)
                   acc2 = tail => Remove(1, tail)
                        = tail => acc1(Remove(1, tail))
                   Remove(3, .)
                   acc3 = tail => Remove(1, Remove(3, tail))
                        = tail => acc2(Remove(3, tail))
              */
              if(countRemoved > 0) {
                printDebug("Detected deletion of " + countRemoved);
                acc = ((acc, countRemoved) => tail => acc(Remove(countRemoved, tail)))(acc, countRemoved);
                tmpValCtx = AddContext(Offset(countRemoved), tmpVal, tmpValCtx);
                tmpVal = tmpVal.slice(countRemoved);
                tmpValStrElems = tmpValStrElems.slice(countRemoved);
                printDebug("tmpVal", tmpVal);
              }
              let countInserted = 0;
              // Insertions
              while(indexNew < newActions.length && newActions[indexNew].isInserted) {
                indexNew++;
                countInserted++;
              }
              if(countInserted > 0) {
                printDebug("Detected insertion of " + countInserted);
                let o = [];
                for(let i = 0; i < countInserted; i++) {
                  let newEdit = editDiff(tmpVal, newVal[indexNew - countInserted + i], {...options, isCompatibleForReplace: () => false,
                  
                  }, tmpValCtx);
                  o[i] = newEdit;
                }
                let n = New(o);
                acc = ((acc, countInserted, n) => tail => acc(Prepend(countInserted, n, tail)))(acc, countInserted, n);
              }
              let countKept = 0;
              // Keeps
              while(indexNew < newActions.length && indexOld < oldActions.length && !newActions[indexNew].isInserted && !oldActions[indexOld].isRemoved) {
                indexNew++;
                indexOld++;
                countKept++;
              }
              if(countKept > 0) {
                printDebug("Detected equal of " + countKept);
                printDebug("tmpVal", tmpVal);
                
                let o = {};
                let tmpVal1 = tmpVal.slice(0, countKept);
                let allIdentity = true;
                for(let i = 0; i < countKept; i++) {
                  if(tmpValStrElems[i] === newValStrElems[indexNew - countKept + i]) continue;
                  let tmpValCtx1 = AddContext(i, tmpVal1, AddContext(Offset(0, countKept), tmpVal, tmpValCtx));
                  o[i] = editDiff(tmpVal[i], newVal[indexNew - countKept + i], options, tmpValCtx1);
                  allIdentity = allIdentity && isIdentity(o[i]);
                }
                let n = Reuse(o);
                printDebug(n);
                acc = ((acc, n, countKept, allIdentity) => tail =>
                 acc(allIdentity ? isIdentity(tail) ? Reuse() : Keep(countKept, tail) :
                  isIdentity(tail) ? n : Replace(countKept, countKept, n, tail)))(acc, n, countKept, allIdentity);
                tmpValCtx = AddContext(Offset(countKept), tmpVal, tmpValCtx);
                tmpVal = tmpVal.slice(countKept);
                tmpValStrElems = tmpValStrElems.slice(countKept);
                printDebug("tmpVal", tmpVal);
              }
            }
            printDebug("finished");
            diffs.push(acc(Reuse()));
          }
        }
        // Now check if the new value was unwrapped
        let unwrappingPaths = allClonePaths_(oldVal, newVal, options.maxCloneDown);
        for(let c in unwrappingPaths) {
          /** Proof 
            We know that if c is allClonePaths_(oldVal, newVal, _)
            then for any ctx, and expecially oldValCtx, apply(c, oldVal, ctx) = newVal
            QED;
          */
          diffs.push(unwrappingPaths[c]);
        }
        // Now let's create a new object or array and obtain the children from the original.
        // Values might be wrapped that way.
        return addNewObjectDiffs(diffs);
      }
    }
    // Symbols
    return Reuse();
  } // editActions.editDiff
  // Diff algorithm
  /**
   * This library modifies the diff-patch-match library by Neil Fraser
   * by removing the patch and match functionality and certain advanced
   * options in the diff function. The original license is as follows:
   *
   * ===
   *
   * Diff Match and Patch
   *
   * Copyright 2006 Google Inc.
   * http://code.google.com/p/google-diff-match-patch/
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   */


  /**
   * The data structure representing a diff is an array of tuples:
   * [[DIFF_DELETE, 'Hello'], [DIFF_INSERT, 'Goodbye'], [DIFF_EQUAL, ' world.']]
   * which means: remove 'Hello', add 'Goodbye' and keep ' world.'
   */
  var DIFF_DELETE = -1;
  var DIFF_INSERT = 1;
  var DIFF_EQUAL = 0;


  /**
   * Find the differences between two texts.  Simplifies the problem by stripping
   * any common prefix or suffix off the texts before diffing.
   * @param {string} text1 Old string to be diffed.
   * @param {string} text2 New string to be diffed.
   * @param {Int|Object} [cursor_pos] Edit position in text1 or object with more info
   * @return {Array} Array of diff tuples.
   */
  function diff_main(text1, text2, cursor_pos, _fix_unicode) {
    // Check for equality
    if (text1 === text2) {
      if (text1) {
        return [[DIFF_EQUAL, text1]];
      }
      return [];
    }

    if (cursor_pos != null) {
      var editdiff = find_cursor_edit_diff(text1, text2, cursor_pos);
      if (editdiff) {
        return editdiff;
      }
    }

    // Trim off common prefix (speedup).
    var commonlength = diff_commonPrefix(text1, text2);
    var commonprefix = text1.substring(0, commonlength);
    text1 = text1.substring(commonlength);
    text2 = text2.substring(commonlength);

    // Trim off common suffix (speedup).
    commonlength = diff_commonSuffix(text1, text2);
    var commonsuffix = text1.substring(text1.length - commonlength);
    text1 = text1.substring(0, text1.length - commonlength);
    text2 = text2.substring(0, text2.length - commonlength);

    // Compute the diff on the middle block.
    var diffs = diff_compute_(text1, text2);

    // Restore the prefix and suffix.
    if (commonprefix) {
      diffs.unshift([DIFF_EQUAL, commonprefix]);
    }
    if (commonsuffix) {
      diffs.push([DIFF_EQUAL, commonsuffix]);
    }
    diff_cleanupMerge(diffs, _fix_unicode);
    return diffs;
  };


  /**
   * Find the differences between two texts.  Assumes that the texts do not
   * have any common prefix or suffix.
   * @param {string} text1 Old string to be diffed.
   * @param {string} text2 New string to be diffed.
   * @return {Array} Array of diff tuples.
   */
  function diff_compute_(text1, text2) {
    var diffs;

    if (!text1) {
      // Just add some text (speedup).
      return [[DIFF_INSERT, text2]];
    }

    if (!text2) {
      // Just delete some text (speedup).
      return [[DIFF_DELETE, text1]];
    }

    var longtext = text1.length > text2.length ? text1 : text2;
    var shorttext = text1.length > text2.length ? text2 : text1;
    var i = longtext.indexOf(shorttext);
    if (i !== -1) {
      // Shorter text is inside the longer text (speedup).
      diffs = [
        [DIFF_INSERT, longtext.substring(0, i)],
        [DIFF_EQUAL, shorttext],
        [DIFF_INSERT, longtext.substring(i + shorttext.length)]
      ];
      // Swap insertions for deletions if diff is reversed.
      if (text1.length > text2.length) {
        diffs[0][0] = diffs[2][0] = DIFF_DELETE;
      }
      return diffs;
    }

    if (shorttext.length === 1) {
      // Single character string.
      // After the previous speedup, the character can't be an equality.
      return [[DIFF_DELETE, text1], [DIFF_INSERT, text2]];
    }

    // Check to see if the problem can be split in two.
    var hm = diff_halfMatch_(text1, text2);
    if (hm) {
      // A half-match was found, sort out the return data.
      var text1_a = hm[0];
      var text1_b = hm[1];
      var text2_a = hm[2];
      var text2_b = hm[3];
      var mid_common = hm[4];
      // Send both pairs off for separate processing.
      var diffs_a = diff_main(text1_a, text2_a);
      var diffs_b = diff_main(text1_b, text2_b);
      // Merge the results.
      return diffs_a.concat([[DIFF_EQUAL, mid_common]], diffs_b);
    }

    return diff_bisect_(text1, text2);
  };


  /**
   * Find the 'middle snake' of a diff, split the problem in two
   * and return the recursively constructed diff.
   * See Myers 1986 paper: An O(ND) Difference Algorithm and Its Variations.
   * @param {string} text1 Old string to be diffed.
   * @param {string} text2 New string to be diffed.
   * @return {Array} Array of diff tuples.
   * @private
   */
  function diff_bisect_(text1, text2) {
    // Cache the text lengths to prevent multiple calls.
    var text1_length = text1.length;
    var text2_length = text2.length;
    var max_d = Math.ceil((text1_length + text2_length) / 2);
    var v_offset = max_d;
    var v_length = 2 * max_d;
    var v1 = new Array(v_length);
    var v2 = new Array(v_length);
    // Setting all elements to -1 is faster in Chrome & Firefox than mixing
    // integers and undefined.
    for (var x = 0; x < v_length; x++) {
      v1[x] = -1;
      v2[x] = -1;
    }
    v1[v_offset + 1] = 0;
    v2[v_offset + 1] = 0;
    var delta = text1_length - text2_length;
    // If the total number of characters is odd, then the front path will collide
    // with the reverse path.
    var front = (delta % 2 !== 0);
    // Offsets for start and end of k loop.
    // Prevents mapping of space beyond the grid.
    var k1start = 0;
    var k1end = 0;
    var k2start = 0;
    var k2end = 0;
    for (var d = 0; d < max_d; d++) {
      // Walk the front path one step.
      for (var k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
        var k1_offset = v_offset + k1;
        var x1;
        if (k1 === -d || (k1 !== d && v1[k1_offset - 1] < v1[k1_offset + 1])) {
          x1 = v1[k1_offset + 1];
        } else {
          x1 = v1[k1_offset - 1] + 1;
        }
        var y1 = x1 - k1;
        while (
          x1 < text1_length && y1 < text2_length &&
          text1.charAt(x1) === text2.charAt(y1)
        ) {
          x1++;
          y1++;
        }
        v1[k1_offset] = x1;
        if (x1 > text1_length) {
          // Ran off the right of the graph.
          k1end += 2;
        } else if (y1 > text2_length) {
          // Ran off the bottom of the graph.
          k1start += 2;
        } else if (front) {
          var k2_offset = v_offset + delta - k1;
          if (k2_offset >= 0 && k2_offset < v_length && v2[k2_offset] !== -1) {
            // Mirror x2 onto top-left coordinate system.
            var x2 = text1_length - v2[k2_offset];
            if (x1 >= x2) {
              // Overlap detected.
              return diff_bisectSplit_(text1, text2, x1, y1);
            }
          }
        }
      }

      // Walk the reverse path one step.
      for (var k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
        var k2_offset = v_offset + k2;
        var x2;
        if (k2 === -d || (k2 !== d && v2[k2_offset - 1] < v2[k2_offset + 1])) {
          x2 = v2[k2_offset + 1];
        } else {
          x2 = v2[k2_offset - 1] + 1;
        }
        var y2 = x2 - k2;
        while (
          x2 < text1_length && y2 < text2_length &&
          text1.charAt(text1_length - x2 - 1) === text2.charAt(text2_length - y2 - 1)
        ) {
          x2++;
          y2++;
        }
        v2[k2_offset] = x2;
        if (x2 > text1_length) {
          // Ran off the left of the graph.
          k2end += 2;
        } else if (y2 > text2_length) {
          // Ran off the top of the graph.
          k2start += 2;
        } else if (!front) {
          var k1_offset = v_offset + delta - k2;
          if (k1_offset >= 0 && k1_offset < v_length && v1[k1_offset] !== -1) {
            var x1 = v1[k1_offset];
            var y1 = v_offset + x1 - k1_offset;
            // Mirror x2 onto top-left coordinate system.
            x2 = text1_length - x2;
            if (x1 >= x2) {
              // Overlap detected.
              return diff_bisectSplit_(text1, text2, x1, y1);
            }
          }
        }
      }
    }
    // Diff took too long and hit the deadline or
    // number of diffs equals number of characters, no commonality at all.
    return [[DIFF_DELETE, text1], [DIFF_INSERT, text2]];
  };


  /**
   * Given the location of the 'middle snake', split the diff in two parts
   * and recurse.
   * @param {string} text1 Old string to be diffed.
   * @param {string} text2 New string to be diffed.
   * @param {number} x Index of split point in text1.
   * @param {number} y Index of split point in text2.
   * @return {Array} Array of diff tuples.
   */
  function diff_bisectSplit_(text1, text2, x, y) {
    var text1a = text1.substring(0, x);
    var text2a = text2.substring(0, y);
    var text1b = text1.substring(x);
    var text2b = text2.substring(y);

    // Compute both diffs serially.
    var diffs = diff_main(text1a, text2a);
    var diffsb = diff_main(text1b, text2b);

    return diffs.concat(diffsb);
  };


  /**
   * Determine the common prefix of two strings.
   * @param {string} text1 First string.
   * @param {string} text2 Second string.
   * @return {number} The number of characters common to the start of each
   *     string.
   */
  function diff_commonPrefix(text1, text2) {
    // Quick check for common null cases.
    if (!text1 || !text2 || text1.charAt(0) !== text2.charAt(0)) {
      return 0;
    }
    // Binary search.
    // Performance analysis: http://neil.fraser.name/news/2007/10/09/
    var pointermin = 0;
    var pointermax = Math.min(text1.length, text2.length);
    var pointermid = pointermax;
    var pointerstart = 0;
    while (pointermin < pointermid) {
      if (
        text1.substring(pointerstart, pointermid) ==
        text2.substring(pointerstart, pointermid)
      ) {
        pointermin = pointermid;
        pointerstart = pointermin;
      } else {
        pointermax = pointermid;
      }
      pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
    }

    if (is_surrogate_pair_start(text1.charCodeAt(pointermid - 1))) {
      pointermid--;
    }

    return pointermid;
  };


  /**
   * Determine the common suffix of two strings.
   * @param {string} text1 First string.
   * @param {string} text2 Second string.
   * @return {number} The number of characters common to the end of each string.
   */
  function diff_commonSuffix(text1, text2) {
    // Quick check for common null cases.
    if (!text1 || !text2 || text1.slice(-1) !== text2.slice(-1)) {
      return 0;
    }
    // Binary search.
    // Performance analysis: http://neil.fraser.name/news/2007/10/09/
    var pointermin = 0;
    var pointermax = Math.min(text1.length, text2.length);
    var pointermid = pointermax;
    var pointerend = 0;
    while (pointermin < pointermid) {
      if (
        text1.substring(text1.length - pointermid, text1.length - pointerend) ==
        text2.substring(text2.length - pointermid, text2.length - pointerend)
      ) {
        pointermin = pointermid;
        pointerend = pointermin;
      } else {
        pointermax = pointermid;
      }
      pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
    }

    if (is_surrogate_pair_end(text1.charCodeAt(text1.length - pointermid))) {
      pointermid--;
    }

    return pointermid;
  };


  /**
   * Do the two texts share a substring which is at least half the length of the
   * longer text?
   * This speedup can produce non-minimal diffs.
   * @param {string} text1 First string.
   * @param {string} text2 Second string.
   * @return {Array.<string>} Five element Array, containing the prefix of
   *     text1, the suffix of text1, the prefix of text2, the suffix of
   *     text2 and the common middle.  Or null if there was no match.
   */
  function diff_halfMatch_(text1, text2) {
    var longtext = text1.length > text2.length ? text1 : text2;
    var shorttext = text1.length > text2.length ? text2 : text1;
    if (longtext.length < 4 || shorttext.length * 2 < longtext.length) {
      return null;  // Pointless.
    }

    /**
     * Does a substring of shorttext exist within longtext such that the substring
     * is at least half the length of longtext?
     * Closure, but does not reference any external variables.
     * @param {string} longtext Longer string.
     * @param {string} shorttext Shorter string.
     * @param {number} i Start index of quarter length substring within longtext.
     * @return {Array.<string>} Five element Array, containing the prefix of
     *     longtext, the suffix of longtext, the prefix of shorttext, the suffix
     *     of shorttext and the common middle.  Or null if there was no match.
     * @private
     */
    function diff_halfMatchI_(longtext, shorttext, i) {
      // Start with a 1/4 length substring at position i as a seed.
      var seed = longtext.substring(i, i + Math.floor(longtext.length / 4));
      var j = -1;
      var best_common = '';
      var best_longtext_a, best_longtext_b, best_shorttext_a, best_shorttext_b;
      while ((j = shorttext.indexOf(seed, j + 1)) !== -1) {
        var prefixLength = diff_commonPrefix(
          longtext.substring(i), shorttext.substring(j));
        var suffixLength = diff_commonSuffix(
          longtext.substring(0, i), shorttext.substring(0, j));
        if (best_common.length < suffixLength + prefixLength) {
          best_common = shorttext.substring(
            j - suffixLength, j) + shorttext.substring(j, j + prefixLength);
          best_longtext_a = longtext.substring(0, i - suffixLength);
          best_longtext_b = longtext.substring(i + prefixLength);
          best_shorttext_a = shorttext.substring(0, j - suffixLength);
          best_shorttext_b = shorttext.substring(j + prefixLength);
        }
      }
      if (best_common.length * 2 >= longtext.length) {
        return [
          best_longtext_a, best_longtext_b,
          best_shorttext_a, best_shorttext_b, best_common
        ];
      } else {
        return null;
      }
    }

    // First check if the second quarter is the seed for a half-match.
    var hm1 = diff_halfMatchI_(longtext, shorttext, Math.ceil(longtext.length / 4));
    // Check again based on the third quarter.
    var hm2 = diff_halfMatchI_(longtext, shorttext, Math.ceil(longtext.length / 2));
    var hm;
    if (!hm1 && !hm2) {
      return null;
    } else if (!hm2) {
      hm = hm1;
    } else if (!hm1) {
      hm = hm2;
    } else {
      // Both matched.  Select the longest.
      hm = hm1[4].length > hm2[4].length ? hm1 : hm2;
    }

    // A half-match was found, sort out the return data.
    var text1_a, text1_b, text2_a, text2_b;
    if (text1.length > text2.length) {
      text1_a = hm[0];
      text1_b = hm[1];
      text2_a = hm[2];
      text2_b = hm[3];
    } else {
      text2_a = hm[0];
      text2_b = hm[1];
      text1_a = hm[2];
      text1_b = hm[3];
    }
    var mid_common = hm[4];
    return [text1_a, text1_b, text2_a, text2_b, mid_common];
  };


  /**
   * Reorder and merge like edit sections.  Merge equalities.
   * Any edit section can move as long as it doesn't cross an equality.
   * @param {Array} diffs Array of diff tuples.
   * @param {boolean} fix_unicode Whether to normalize to a unicode-correct diff
   */
  function diff_cleanupMerge(diffs, fix_unicode) {
    diffs.push([DIFF_EQUAL, '']);  // Add a dummy entry at the end.
    var pointer = 0;
    var count_delete = 0;
    var count_insert = 0;
    var text_delete = '';
    var text_insert = '';
    var commonlength;
    while (pointer < diffs.length) {
      if (pointer < diffs.length - 1 && !diffs[pointer][1]) {
        diffs.splice(pointer, 1);
        continue;
      }
      switch (diffs[pointer][0]) {
        case DIFF_INSERT:

          count_insert++;
          text_insert += diffs[pointer][1];
          pointer++;
          break;
        case DIFF_DELETE:
          count_delete++;
          text_delete += diffs[pointer][1];
          pointer++;
          break;
        case DIFF_EQUAL:
          var previous_equality = pointer - count_insert - count_delete - 1;
          if (fix_unicode) {
            // prevent splitting of unicode surrogate pairs.  when fix_unicode is true,
            // we assume that the old and new text in the diff are complete and correct
            // unicode-encoded JS strings, but the tuple boundaries may fall between
            // surrogate pairs.  we fix this by shaving off stray surrogates from the end
            // of the previous equality and the beginning of this equality.  this may create
            // empty equalities or a common prefix or suffix.  for example, if AB and AC are
            // emojis, `[[0, 'A'], [-1, 'BA'], [0, 'C']]` would turn into deleting 'ABAC' and
            // inserting 'AC', and then the common suffix 'AC' will be eliminated.  in this
            // particular case, both equalities go away, we absorb any previous inequalities,
            // and we keep scanning for the next equality before rewriting the tuples.
            if (previous_equality >= 0 && ends_with_pair_start(diffs[previous_equality][1])) {
              var stray = diffs[previous_equality][1].slice(-1);
              diffs[previous_equality][1] = diffs[previous_equality][1].slice(0, -1);
              text_delete = stray + text_delete;
              text_insert = stray + text_insert;
              if (!diffs[previous_equality][1]) {
                // emptied out previous equality, so delete it and include previous delete/insert
                diffs.splice(previous_equality, 1);
                pointer--;
                var k = previous_equality - 1;
                if (diffs[k] && diffs[k][0] === DIFF_INSERT) {
                  count_insert++;
                  text_insert = diffs[k][1] + text_insert;
                  k--;
                }
                if (diffs[k] && diffs[k][0] === DIFF_DELETE) {
                  count_delete++;
                  text_delete = diffs[k][1] + text_delete;
                  k--;
                }
                previous_equality = k;
              }
            }
            if (starts_with_pair_end(diffs[pointer][1])) {
              var stray = diffs[pointer][1].charAt(0);
              diffs[pointer][1] = diffs[pointer][1].slice(1);
              text_delete += stray;
              text_insert += stray;
            }
          }
          if (pointer < diffs.length - 1 && !diffs[pointer][1]) {
            // for empty equality not at end, wait for next equality
            diffs.splice(pointer, 1);
            break;
          }
          if (text_delete.length > 0 || text_insert.length > 0) {
            // note that diff_commonPrefix and diff_commonSuffix are unicode-aware
            if (text_delete.length > 0 && text_insert.length > 0) {
              // Factor out any common prefixes.
              commonlength = diff_commonPrefix(text_insert, text_delete);
              if (commonlength !== 0) {
                if (previous_equality >= 0) {
                  diffs[previous_equality][1] += text_insert.substring(0, commonlength);
                } else {
                  diffs.splice(0, 0, [DIFF_EQUAL, text_insert.substring(0, commonlength)]);
                  pointer++;
                }
                text_insert = text_insert.substring(commonlength);
                text_delete = text_delete.substring(commonlength);
              }
              // Factor out any common suffixes.
              commonlength = diff_commonSuffix(text_insert, text_delete);
              if (commonlength !== 0) {
                diffs[pointer][1] =
                  text_insert.substring(text_insert.length - commonlength) + diffs[pointer][1];
                text_insert = text_insert.substring(0, text_insert.length - commonlength);
                text_delete = text_delete.substring(0, text_delete.length - commonlength);
              }
            }
            // Remove the offending records and add the merged ones.
            var n = count_insert + count_delete;
            if (text_delete.length === 0 && text_insert.length === 0) {
              diffs.splice(pointer - n, n);
              pointer = pointer - n;
            } else if (text_delete.length === 0) {
              diffs.splice(pointer - n, n, [DIFF_INSERT, text_insert]);
              pointer = pointer - n + 1;
            } else if (text_insert.length === 0) {
              diffs.splice(pointer - n, n, [DIFF_DELETE, text_delete]);
              pointer = pointer - n + 1;
            } else {
              diffs.splice(pointer - n, n, [DIFF_DELETE, text_delete], [DIFF_INSERT, text_insert]);
              pointer = pointer - n + 2;
            }
          }
          if (pointer !== 0 && diffs[pointer - 1][0] === DIFF_EQUAL) {
            // Merge this equality with the previous one.
            diffs[pointer - 1][1] += diffs[pointer][1];
            diffs.splice(pointer, 1);
          } else {
            pointer++;
          }
          count_insert = 0;
          count_delete = 0;
          text_delete = '';
          text_insert = '';
          break;
      }
    }
    if (diffs[diffs.length - 1][1] === '') {
      diffs.pop();  // Remove the dummy entry at the end.
    }

    // Second pass: look for single edits surrounded on both sides by equalities
    // which can be shifted sideways to eliminate an equality.
    // e.g: A<ins>BA</ins>C -> <ins>AB</ins>AC
    var changes = false;
    pointer = 1;
    // Intentionally ignore the first and last element (don't need checking).
    while (pointer < diffs.length - 1) {
      if (diffs[pointer - 1][0] === DIFF_EQUAL &&
        diffs[pointer + 1][0] === DIFF_EQUAL) {
        // This is a single edit surrounded by equalities.
        if (diffs[pointer][1].substring(diffs[pointer][1].length -
          diffs[pointer - 1][1].length) === diffs[pointer - 1][1]) {
          // Shift the edit over the previous equality.
          diffs[pointer][1] = diffs[pointer - 1][1] +
            diffs[pointer][1].substring(0, diffs[pointer][1].length -
              diffs[pointer - 1][1].length);
          diffs[pointer + 1][1] = diffs[pointer - 1][1] + diffs[pointer + 1][1];
          diffs.splice(pointer - 1, 1);
          changes = true;
        } else if (diffs[pointer][1].substring(0, diffs[pointer + 1][1].length) ==
          diffs[pointer + 1][1]) {
          // Shift the edit over the next equality.
          diffs[pointer - 1][1] += diffs[pointer + 1][1];
          diffs[pointer][1] =
            diffs[pointer][1].substring(diffs[pointer + 1][1].length) +
            diffs[pointer + 1][1];
          diffs.splice(pointer + 1, 1);
          changes = true;
        }
      }
      pointer++;
    }
    // If shifts were made, the diff needs reordering and another shift sweep.
    if (changes) {
      diff_cleanupMerge(diffs, fix_unicode);
    }
  };

  function is_surrogate_pair_start(charCode) {
    return charCode >= 0xD800 && charCode <= 0xDBFF;
  }

  function is_surrogate_pair_end(charCode) {
    return charCode >= 0xDC00 && charCode <= 0xDFFF;
  }

  function starts_with_pair_end(str) {
    return is_surrogate_pair_end(str.charCodeAt(0));
  }

  function ends_with_pair_start(str) {
    return is_surrogate_pair_start(str.charCodeAt(str.length - 1));
  }

  function remove_empty_tuples(tuples) {
    var ret = [];
    for (var i = 0; i < tuples.length; i++) {
      if (tuples[i][1].length > 0) {
        ret.push(tuples[i]);
      }
    }
    return ret;
  }

  function make_edit_splice(before, oldMiddle, newMiddle, after) {
    if (ends_with_pair_start(before) || starts_with_pair_end(after)) {
      return null;
    }
    return remove_empty_tuples([
      [DIFF_EQUAL, before],
      [DIFF_DELETE, oldMiddle],
      [DIFF_INSERT, newMiddle],
      [DIFF_EQUAL, after]
    ]);
  }

  function find_cursor_edit_diff(oldText, newText, cursor_pos) {
    // note: this runs after equality check has ruled out exact equality
    var oldRange = typeof cursor_pos === 'number' ?
      { index: cursor_pos, length: 0 } : cursor_pos.oldRange;
    var newRange = typeof cursor_pos === 'number' ?
      null : cursor_pos.newRange;
    // take into account the old and new selection to generate the best diff
    // possible for a text edit.  for example, a text change from "xxx" to "xx"
    // could be a delete or forwards-delete of any one of the x's, or the
    // result of selecting two of the x's and typing "x".
    var oldLength = oldText.length;
    var newLength = newText.length;
    if (oldRange.length === 0 && (newRange === null || newRange.length === 0)) {
      // see if we have an insert or delete before or after cursor
      var oldCursor = oldRange.index;
      var oldBefore = oldText.slice(0, oldCursor);
      var oldAfter = oldText.slice(oldCursor);
      var maybeNewCursor = newRange ? newRange.index : null;
      editBefore: {
        // is this an insert or delete right before oldCursor?
        var newCursor = oldCursor + newLength - oldLength;
        if (maybeNewCursor !== null && maybeNewCursor !== newCursor) {
          break editBefore;
        }
        if (newCursor < 0 || newCursor > newLength) {
          break editBefore;
        }
        var newBefore = newText.slice(0, newCursor);
        var newAfter = newText.slice(newCursor);
        if (newAfter !== oldAfter) {
          break editBefore;
        }
        var prefixLength = Math.min(oldCursor, newCursor);
        var oldPrefix = oldBefore.slice(0, prefixLength);
        var newPrefix = newBefore.slice(0, prefixLength);
        if (oldPrefix !== newPrefix) {
          break editBefore;
        }
        var oldMiddle = oldBefore.slice(prefixLength);
        var newMiddle = newBefore.slice(prefixLength);
        return make_edit_splice(oldPrefix, oldMiddle, newMiddle, oldAfter);
      }
      editAfter: {
        // is this an insert or delete right after oldCursor?
        if (maybeNewCursor !== null && maybeNewCursor !== oldCursor) {
          break editAfter;
        }
        var cursor = oldCursor;
        var newBefore = newText.slice(0, cursor);
        var newAfter = newText.slice(cursor);
        if (newBefore !== oldBefore) {
          break editAfter;
        }
        var suffixLength = Math.min(oldLength - cursor, newLength - cursor);
        var oldSuffix = oldAfter.slice(oldAfter.length - suffixLength);
        var newSuffix = newAfter.slice(newAfter.length - suffixLength);
        if (oldSuffix !== newSuffix) {
          break editAfter;
        }
        var oldMiddle = oldAfter.slice(0, oldAfter.length - suffixLength);
        var newMiddle = newAfter.slice(0, newAfter.length - suffixLength);
        return make_edit_splice(oldBefore, oldMiddle, newMiddle, oldSuffix);
      }
    }
    if (oldRange.length > 0 && newRange && newRange.length === 0) {
      replaceRange: {
        // see if diff could be a splice of the old selection range
        var oldPrefix = oldText.slice(0, oldRange.index);
        var oldSuffix = oldText.slice(oldRange.index + oldRange.length);
        var prefixLength = oldPrefix.length;
        var suffixLength = oldSuffix.length;
        if (newLength < prefixLength + suffixLength) {
          break replaceRange;
        }
        var newPrefix = newText.slice(0, prefixLength);
        var newSuffix = newText.slice(newLength - suffixLength);
        if (oldPrefix !== newPrefix || oldSuffix !== newSuffix) {
          break replaceRange;
        }
        var oldMiddle = oldText.slice(prefixLength, oldLength - suffixLength);
        var newMiddle = newText.slice(prefixLength, newLength - suffixLength);
        return make_edit_splice(oldPrefix, oldMiddle, newMiddle, oldSuffix);
      }
    }

    return null;
  }

  function strDiff(text1, text2, cursor_pos) {
    // only pass fix_unicode=true at the top level, not when diff_main is
    // recursively invoked
    return diff_main(text1, text2, cursor_pos, true);
  }
  
  // TODO: Exclamation points should be closer to letters than html symbols like < or >
  let affinityArray = // First dimension: Left char. Second dimension: Right char
    [ [19,9,  6, 11,1,14]  // digit vs digit, dot, words, spaces, html chars, others
    , [ 5,0,  3, 12,1,16]  // dot vs digit, dot, words, spaces, html chars, others
    , [ 2,18,24, 21,1,22]  // words vs digit, dot, words, spaces, html chars, others
    , [ 8,2, 17,  7,1,20]  // spaces vs digit, dot, words, spaces, html chars, others
    , [ 1,1,1,1,2,1]  // html vs digit, dot, words, spaces, html chars, others
    , [15,4, 23, 10,1,13]];// others vs digit, dot, words, spaces, html chars, others

  function classOf(c) {
    if(c >= '0' && c <= '9') return 0;
    if(c == '.') return 1;
    if(c >= 'a' && c <= 'z' || c >= 'Z' && c <= 'Z' || c == "_" || c == "_") return 2;
    if((/\s/.exec(c))) return 3;
    if(c === "<" || c === ">" || c === "\"") return 4;
    return 5;
  }
  
  function affinityChar(c1, c2) {
    return affinityArray[classOf(c1)][classOf(c2)];
  }
  
  function affinity(s1, s2) {
    if(s1.length === 0) return 25;
    let s1Last = s1[s1.length - 1];
    if(s2.length === 0) return 25;
    let s2First = s2[0];
    return affinityChar(s1Last, s2First);
  }  

  strDiff.INSERT = DIFF_INSERT;
  strDiff.DELETE = DIFF_DELETE;
  strDiff.EQUAL = DIFF_EQUAL;
  
  /** Let's assume: apply(eaStrDiff(text1, text2), text1, ctx) = text2 */
  function eaStrDiff(text1, text2, withAppend = true) {
    let linear_diff = strDiff(text1, text2);
    // Conversion of List [DIFF_INSERT | DIFF_DELETE | DIFF_EQUAL, String] to ndStrDiff.
    var index = linear_diff.length - 1;
    var acc = Reuse();
    while(index >= 0) {
      let s = linear_diff[index];
      switch(s[0]) {
        case DIFF_INSERT:// We were already at the end, we can just say "New"
          if(index > 0) {
            let f = linear_diff[index - 1];
            if(f[0] == DIFF_DELETE) {
              acc = Prepend(s[1].length, s[1], Remove(f[1].length, acc));
              index -= 2;
              break;
            } else if(withAppend && f[0] == DIFF_EQUAL) { // It's equal. Let's see if the affinity is towars left or towards the right.
              let affinityBefore = affinity(f[1], s[1]);
              let affinityAfter = index < linear_diff.length - 1 ? affinity(s[1], linear_diff[index + 1][1]) : 0;
              if(affinityBefore > affinityAfter) {
                acc = Keep(f[1].length - 1, Replace(1, 1 + s[1].length, Append(1, s[1]), acc));
                index -= 2;
                break;
              }
            }
          }
          acc = Prepend(s[1].length, s[1], acc);
          index -= 1;
          break;
        case DIFF_DELETE: // We were already at the deletion position
          acc = Remove(s[1].length, acc);
          index -= 1;
          break;
        case DIFF_EQUAL: 
        default:
          acc = Keep(s[1].length, acc);
          index -= 1;
          break;
      }
    }
    return acc;
  }
  editActions.strDiff = eaStrDiff;
  
  /** Various helper functions */
  function modelToCopy(editAction, prog) {
    return editAction.model.ctor === TypeNewModel.Extend ? prog : editAction.model.value;
    // Now let's clone the original.
  }
  function hasAnyProps(obj) {
    var result = false; for (var key in obj) { result = true; break; }
    return result;
  }
  function hasChildEditActions(editAction) {
    return hasAnyProps(editAction.childEditActions);
  }
  
  var treeOps = {
    Array: {
      init() { return []; },
      access(x, k) { return x[k]; },
      update(x, k, v) { x[k] = v; },
      forEach(x, callback) {
        for(let k in x) {
          callback(x[k], numIfPossible(k), x);
        }
      }
    },
    RecordLike: {
      init() { return {}; },
      access(x, k) { return x[k]; },
      update(x, k, v) { 
        x[k] = v;
      },
      forEach(x, callback) {
        for(let k in x) {
          callback(x[k], numIfPossible(k), x);
        }
      }
    },
    MapLike: {
      init() { return new Map(); },
      access(x, k) { return x.get(k); },
      update(x, k, v) { x.set(k, v) ; },
      forEach(x, callback) {
        x.forEach((value, key, map) => callback(value, key, map));
      }
    }
  }
  editActions.treeOps = treeOps;
  const identity = Reuse();
  editActions.identity = identity;
  function treeOpsOf(x) {
    return typeof x === "object" ? x instanceof Map ? treeOps.MapLike : Array.isArray(x) ? treeOps.Array : treeOps.RecordLike : treeOps.RecordLike;
  }
  function access(x, k) {
    if(arguments.length == 1) return x;
    let treeOps = treeOpsOf(x);
    return access(treeOps.access(x, k), ...[...arguments].slice(2));
  }
  function forEach(treeLike, callback) {
    return treeOpsOf(treeLike).forEach(treeLike, callback);
  }
  function forEachChild(editAction, callback) {
    return forEach(editAction.childEditActions, callback);
  }
  function forAllChildren(editAction, callback) {
    let isTrue = true;
    forEach(editAction.childEditActions, (c, k) => {
      isTrue = isTrue && callback(c, k)
    });
    return isTrue;
  }
  var monoid = {
    ArrayLike: {
      init() { return []; },
      length(x) {
        let m = 0;
        for(let k in x) {
          m = Math.max(m, Number(k) + 1);
        }
        return m;
      },
      sub(prog, offset, count) {
        return monoid.Array.sub(toArray(prog), offset, offset + count);
      },
      add(tmp, result) {
        return toArray(tmp).concat(toArray(result));
      },
      split(count, array) {
        let a = toArray(array);
        return [a.slice(0, count), a.slice(count)]
      },
      push(tmp, elem) {
        return toArray(tmp).concat([elem])
      }
    },
    Array: {
      init() { return []; },
      length(x) { return x.length; },
      sub(prog, offset, count) {
        return count !== undefined ? prog.slice(offset, offset + count) :  offset !== 0 ? prog.slice(offset) : prog;
      },
      add(tmp, result) {
        return tmp.concat(result);
      },
      split(count, array) {
        return [array.slice(0, count), array.slice(count)]
      },
      push(tmp, elem) {
        return tmp.concat([elem]);
      }
    },
    String: {
      init() { return "" },
      length(x) { return x.length; },
      sub(prog, offset, count) {
        return count !== undefined ? prog.substring(offset, offset + count) : offset !== 0 ? prog.substring(offset) : prog;
      },
      add(tmp, result) {
        return tmp + result;
      },
      split(count, str) {
        return [str.substring(0, count), str.substring(count)]
      },
      push(tmp, elem) {
        return tmp + (elem || " ");
      }
    }
  }
  function monoidOf(prog) {
    return Array.isArray(prog) ? monoid.Array :
         typeof prog  === "string" || typeof prog === "number" || typeof prog === "boolean" ? monoid.String: (() => { console.trace(prog); throw "No monoid available for dealing with " + prog })();
  }
  function isIdentity(editAction) {
    if(!isEditAction(editAction)) return false;
    if(!isReuse(editAction)) return false;
    return !hasAnyProps(editAction.childEditActions);
  }
  editActions.isIdentity = isIdentity;
  function isDown(editAction) {
    return typeof editAction === "object" && editAction.ctor == Type.Down;
  }
  function isReuse(editAction) {
    return typeof editAction == "object" && editAction.ctor == Type.New && editAction.model.ctor === TypeNewModel.Extend;
  }
  function isExtend(editAction) {
    return isReuse(editAction);
  }
  function isNew(editAction) {
    return isObject(editAction) && editAction.ctor == Type.New;
  }
  function isConst(editAction) {
    return isNew(editAction) && editAction.model.ctor == TypeNewModel.Constant || !isEditAction(editAction);
  }
  function isConstInserting(editAction) {
    let isReusingBelow = false;
    if(isObject(editAction.model.value)) {
      forEach(editAction.model.value, (child, k) => {
        if(child) isReusingBelow = true;
      });
    }
    return isReusingBelow;
  }
  function valueIfConst(editAction) {
    return isEditAction(editAction) ? editAction.model.value : editAction;
  }
  function isInsert(editAction) {
    if(!isConst(editAction)) return false;
    let numberKeyWrapping = 0;
    forEach(editAction.model.value, (child, k) => {
      if(child) { numberKeyWrapping++; }
    });
    return numberKeyWrapping == 1;
  }
  function keyIfInsert(editAction) {
    if(!isConst(editAction)) return false;
    let desiredKey = undefined;
    forEach(editAction.model.value, (child, k) => {
      if(child) { desiredKey = k; }
    });
    return desiredKey;
  }
  function isInsertAll(editAction) {
    if(!isConst(editAction)) return false;
    // We detect inserts.
    let keyWrapping = undefined;
    let numberKeyWrapping = 0;
    let numberKeys = 0;
    forEach(editAction.childEditActions, (child, k) => {
      numberKeys++;
    });
    forEach(editAction.model.value, (child, k) => {
      if(child) { numberKeyWrapping++; }
    });
    return numberKeyWrapping == numberKeys && numberKeys > 0;
  }
  function keyInsertedIfInsert(editAction) {
    let model = editAction.model;
    for(let k in model.value) {
      if(model.value[k]) {
        return numIfPossible(k);
      }
    }
    return undefined;
  }
  function isPureNew(editAction) {
    if(!isConst(editAction)) return false;
    let numberKeyWrapping = 0;
    forEach(editAction.model.value, (child, k) => {
      if(child) numberKeyWrapping++;
    });
    return numberKeyWrapping === 0;
  }
  function print() {
    let lastWasEditAction = false;
    console.log([...arguments].map((x, index) => isEditAction(x) ? (lastWasEditAction = true, "\n├┬") + addPadding(uneval(x), "│├") : (index == 0 ? "" : lastWasEditAction ? (lastWasEditAction=false, "\n├ ") : " ") + (typeof x == "string" ? x : uneval(x))).join(""));
  }
  function printDebug() {
    if(editActions.__debug) { print(...arguments); }
  }
  
  // Plus with support for a or b to be undefined (infinity);
  function PlusUndefined(a, b) {
    return a === undefined ? undefined : b === undefined ? undefined : a + b;
  }
  // Minus with support for a to be undefined (infinity)
  function MinusUndefined(a, b) {
    return a === undefined ? undefined : a - b;
  }
  // Minimum with support for a or b to be undefined (infinity)
  function MinUndefined(a, b) {
    return a === undefined ? b : b === undefined ? a : Math.min(a, b)
  }
  function MaxUndefined(a, b) {
    return a === undefined ? a : b === undefined ? b : Math.max(a, b);
  }
  // < with support for at most one of the two to be undefined (infinity)
  function LessThanUndefined(a, b) {
    if(a === undefined && b !== undefined) return false;
    return b === undefined || a < b;
  }
  // <= with support for at most one of the two to be undefined (infinity)
  function LessThanEqualUndefined(a, b) {
    if(a === undefined && b !== undefined) return false;
    return b === undefined || a <= b;
  }
  
  function toSpaces(str) {
    return str.replace(/./g, " ");
  }
  function addPadding(str, padding) {
    return str.replace(/\n/g, "\n" + padding);
  }
  
  function keyOrOffsetToString(keyOrOffset) {
    let str = "";
    if(isOffset(keyOrOffset)) {
      if(keyOrOffset.oldLength === undefined && keyOrOffset.count >= 0) {
        str += "Interval(" + keyOrOffset.count;
        if(keyOrOffset.newLength !== undefined) {
          str += ", " + (keyOrOffset.count + keyOrOffset.newLength);
        }
        str += ")";
      } else {
        str += "Offset(" + keyOrOffset.count;
        if(keyOrOffset.newLength !== undefined || keyOrOffset.oldLength !== undefined) {
          str += ", " + keyOrOffset.newLength;
        }
        if(keyOrOffset.oldLength !== undefined) {
          str += ", " + keyOrOffset.oldLength;
        }
        str += ")";
      }
    } else {
      str += JSON.stringify(keyOrOffset);
    }
    return str;
  }

  // Given a pair (prog, ctx), walks the context down by the provided key or offset and returns a [new prog, new ctx]
  function walkDownCtx(downKeyOrOffset, prog, ctx) {
    return [applyKeyOrOffset(downKeyOrOffset, prog),
            AddContext(downKeyOrOffset, prog, ctx)];
  }
  editActions.walkDownCtx = walkDownCtx;
  
  // Given a pair (prog, ctx), walks the context up by the provided key or offset and returns a [new prog, new ctx]
  function walkUpCtx(upKeyOrOffset, prog, ctx) {
    if(!ctx) {
      console.log("Error, apply with Up but no ctx: ", keyOrOffsetToString(upKeyOrOffset), uneval(prog), uneval(ctx));
    }
    var {hd: {keyOrOffset: keyOrOffset, prog: originalProg}, tl: originalUpCtx} = ctx;
    if(isOffset(upKeyOrOffset)) {
      if(isKey(keyOrOffset)) {
        console.log("Error: up " + keyOrOffsetToString(upKeyOrOffset) + " but no offset context available on " + uneval(prog), ctx);
        return [prog, ctx];
      }
      printDebug("upKeyOrOffset", keyOrOffsetToString(upKeyOrOffset));
      let newOffset = downUpOffsetReturnsUp(keyOrOffset, upKeyOrOffset);
      printDebug("newOffset", keyOrOffsetToString(newOffset));
      let newDownOffset = upToDownOffset(newOffset);
      printDebug("newDownOffset", keyOrOffsetToString(newDownOffset));
      if(!newDownOffset) {
        return [originalProg, originalUpCtx, newOffset]
      }
      return [
        applyOffset(newDownOffset, originalProg),
        AddContext(newDownOffset, originalProg, originalUpCtx)];
    }
    // upKeyOrOffset is not an Offset
    let newCtx = originalUpCtx;
    let newProg = originalProg;
    if(isOffset(keyOrOffset)) { 
    // In this case we just skip it silently.
      return walkUpCtx(upKeyOrOffset, originalProg, originalUpCtx);
    }
    if(keyOrOffset != upKeyOrOffset) {
      console.log("/!\\ Warning, going up with ", keyOrOffsetToString(upKeyOrOffset), " but the previous field was ", keyOrOffsetToString(keyOrOffset), "\nThere are 99.9% of chances you are not going to be impacted, but please fix that just in case.");
    }
    return [newProg, newCtx];
  }
  
  // Given an edit action and its context, returns the original first edit action and the initial context change of Ups.
  function originalFirstActionAndContext(E, ECtx, initUp) {
    if(isObject(ECtx)) {
      if(ECtx.ctor == Type.Up || ECtx.ctor == Type.Down) {
        return originalFirstActionAndContext(E, ECtx.subAction, initUp);
      } else { // A regular context. We reset the initUp.
        return originalFirstActionAndContext(ECtx.prog, ECtx.tl, ECtx.tl);
      }
    } else {
      return [E, initUp];
    }
  }
  
  // Returns true if the two key or offsets are the same.
  function keyOrOffsetAreEqual(keyOrOffset1, keyOrOffset2) {
    if(isOffset(keyOrOffset1)) {
      if(isOffset(keyOrOffset2)) {
        return keyOrOffset1.count === keyOrOffset2.count && keyOrOffset1.newLength === keyOrOffset2.newLength && keyOrOffset1.oldLength == keyOrOffset2.oldLength;
      } else return false;
    } else {
      return keyOrOffset1 === keyOrOffset2;
    }
  }
  
  function isNumeric(num){
    return !isNaN(num);
  }
  function numIfPossible(num) {
    if(isNumeric(num)) return Number(num);
    return num;
  }
  editActions.numIfPossible = numIfPossible;
  
  function stringOf(self) {
    if(Array.isArray(self)) {
      return "[" + self.map(stringOf).join(",\n").replace(/\n/g, "\n ") + "]";
    }
    if(!(isEditAction(self))) { return uneval(self, ""); }
    let isNew = self.ctor == Type.New;
    if(self.ctor == Type.Up) {
      let str = "Up(";
      let selfIsIdentity = false;
      while(self && self.ctor == Type.Up) {
        str += keyOrOffsetToString(self.keyOrOffset);
        self = self.subAction;
        selfIsIdentity = isIdentity(self);
        if(!selfIsIdentity) {
          str += ", ";
        }
      }
      if(!selfIsIdentity) str += stringOf(self);
      str += ")";
      return str;
    } else if(self.ctor == Type.Down) {
      if(isOffset(self.keyOrOffset)) {
        let {count, newLength, oldLength} = self.keyOrOffset;
        if(self.isRemove) {
          if((count === 0 && oldLength === undefined || 
              count === oldLength) && newLength === 0) {
            let k = oldLength !== undefined ? oldLength : "";
            let c = isIdentity(self.subAction) && k == "" ? "" : stringOf(self.subAction);
            return "RemoveAll(" + c + (k != "" ? ", " : "") + k + ")";
          } else if(newLength === undefined && oldLength === undefined) {
            let c = isIdentity(self.subAction) ? "" : ", " + stringOf(self.subAction);
            return "Remove(" + count + c + ")";
          } else if(newLength !== undefined && count === 0) {
            return "KeepOnly(" + newLength + (isIdentity(self.subAction) ? "": ", " + stringOf(self.subAction)) + ")";
          } else {
            return "RemoveExcept(" + keyOrOffsetToString(self.keyOrOffset) + (isIdentity(self.subAction) ? "": ", " + stringOf(self.subAction)) + ")";
          }
        } else if(!isDown(self.subAction)) {
          if((count === 0 && oldLength === undefined || 
              count === oldLength) && newLength === 0) {
            let k = oldLength !== undefined ? oldLength : "";
            let c = isIdentity(self.subAction) && k == "" ? "" : stringOf(self.subAction);
            return "DropAll(" + c + (k != "" ? ", " : "") + k + ")";
          } else if(newLength === undefined && oldLength === undefined) {
            let c = isIdentity(self.subAction) ? "" : ", " + stringOf(self.subAction);
            return "Drop(" + count + c + ")";
          } else if(newLength !== undefined && count === 0) {
            return "DropAfter(" + newLength + (isIdentity(self.subAction) ? "": ", " + stringOf(self.subAction)) + ")";
          } else {
            //return "RemoveExcept(" + keyOrOffsetToString(self.keyOrOffset) + (isIdentity(self.subAction) ? "": ", " + stringOf(self.subAction)) + ")";
            // Regular Down here
          }
        }
      }
      let str = ""; // We'll prepend the Down( later just in case we need pure Down
      let selfIsIdentity = false;
      let removeStart = self.isRemove;
      while(self && self.ctor == Type.Down && self.isRemove == removeStart) {
        str += keyOrOffsetToString(self.keyOrOffset);
        self = self.subAction;
        selfIsIdentity = isIdentity(self);
        if(!selfIsIdentity)
          str += ", ";
      }
      if(!selfIsIdentity) str += stringOf(self);
      str += ")";
      // Numbers and strings are interpreted as path elements.
      str = (isPathElement(self) ? "Down.pure" : "Down") +"(" + str;
      return str;
    } else if(self.ctor == Type.New) { // New or Reuse
      let model = self.model;
      let selfIsReuse = model.ctor == TypeNewModel.Extend;
      let str = "";
      let selfIsInsert = false;
      let selfIsInsertAll = false;
      let selfIsPureNew = false;
      if(selfIsReuse) {
        str = model.create ? "ReuseAsIs(" : "Reuse(";
      } else {
        if(typeof model.value != "object") {
          str += (editActions.toPHPString ? "Create" : "New")+"(" + uneval(model.value);
        } else {
          if(isInsertAll(self)) {
            selfIsInsertAll = true;
            str += "InsertAll(";
          } else if(isInsert(self)) {
            selfIsInsert = true;
            str += "Insert(" + uneval(keyInsertedIfInsert(self)) + ", ";
          } else {
            str += "New(";
            selfIsPureNew = isPureNew(self);
          }
        }
      }
      if((selfIsReuse && hasAnyProps(self.childEditActions)) || (!selfIsReuse && typeof model.value === "object")) {
        let parts = [];
        let allNumeric = true;
        let expectedIndex = 0;
        let fillInBetween = !selfIsReuse && Array.isArray(model.value);
        // TODO: Deal with the case when childEditActions is a Map.
        // As per JS spec, numeric keys go first.
        forEach(self.childEditActions, (child, k) => {
          if(!isNumeric(k)) {
            allNumeric = false;
          } else {
            while(fillInBetween && expectedIndex < k) {
              parts.push([expectedIndex, "undefined"])
              expectedIndex++;
            }
          }
          let childStr =
                selfIsReuse ? 
                  isObject(child) && child.ctor == Type.Down && child.keyOrOffset == k ? stringOf(child.subAction) : stringOf(Up(k, child))
                : stringOf(child);
          parts.push([k, childStr]);
          expectedIndex++;
        });
        if(!selfIsReuse && allNumeric && Array.isArray(model.value)) {
          let extraSpace = parts.length > 1 && parts[0][1].indexOf("\n") >= 0 ? "\n" : "";
          str += "[" + extraSpace + parts.map(([k, s]) =>  addPadding(s, "  ")).join(", ") + "]";
        } else {
          str += "{" + parts.map(([k, s]) => "\n" + k + ": " + addPadding(s, "  ")).join(",") + "}";
        }
        
        let selfIsMap = !selfIsReuse && model.value instanceof Map;
        let secondParamNecessary = !selfIsInsert && !selfIsReuse && !selfIsPureNew && !selfIsInsertAll || selfIsMap;
        if(secondParamNecessary) {
          let insertModelNecessary = !Array.isArray(model.value) && !(model.value instanceof Map) && isObject(model.value) && "ctor" in model.value;
          str += ", " + (insertModelNecessary ? "ConstModel(" : "");
          if(Array.isArray(model.value)) {
            str += "[";
            let first = true;
            for(let k = 0; k < model.value.length; k++) {
              if(first) first = false;
              else str += ", ";
              str += k in model.value ? "WRAP" : "NEW";
            }
            str += "]";
          } else if(model.value instanceof Map) {
            str += "new Map([";
            let first = true;
            forEach(model.value, (child, k) => {
              if(first) first = false;
              else str += ", ";
              str += "[" + uneval(k) + ", WRAP]";
            });
            str += "])";
          } else {
            str += "{";
            let first = true;
            for(let k in model.value) {
              if(first) first = false;
              else str += ", ";
              str += k + ": WRAP";
            }
            str += "}";
          }
          if(insertModelNecessary) {
            str += ")";
          }
        }
      }
      str += ")";
      return str;
    } else if(self.ctor == Type.Concat) { // Replace
      let [inCount, outCount, left, right] = argumentsIfReplace(self);
      str = "";
      if(right !== undefined && editActions.__syntacticSugarReplace) {
        let [keep, subAction] = argumentsIfReplaceIsKeep(inCount, outCount, left, right);
        if(subAction !== undefined && editActions.__syntacticSugar) {
          str = "Keep(" + keep + ", ";
          let childStr = stringOf(subAction);
          str += addPadding(childStr, "  ");
          str += ")";
        } else {
          str = "Replace(" + inCount + ", " + outCount + ",\n  ";
          let leftStr = stringOf(left);
          str += addPadding(leftStr, "  ");
          if(!isIdentity(right)) {
            str += ",\n  ";
            let rightStr = stringOf(right);
            str += addPadding(rightStr, "  ");
          }
          str += ")";
        }
      } else {
        if(self.secondReuse && !self.firstReuse && editActions.__syntacticSugar) {
          let inserted = self.first;
          let second = self.second;
          str += "Prepend(" + self.count + ", ";
          let childStr = addPadding(stringOf(inserted), "  ");
          str += childStr;
          let extraSpace = childStr.indexOf("\n") >= 0 ? "\n " : "";
          if(!isIdentity(second)) {
            let secondStr = addPadding(stringOf(second), "  ");
            extraSpace = extraSpace == "" && secondStr.indexOf("\n") >= 0 ? "\n " : extraSpace;
            str += ","+extraSpace+" " + secondStr;
          }
          str += ")";
        } else if(!self.secondReuse && self.firstReuse && editActions.__syntacticSugar) {
          let first = self.first;
          let inserted = self.second;
          str += "Append(" + self.count + ", ";
          if(!isIdentity(first)) {
            str += addPadding("\n" + stringOf(first), "  ") + ",\n  ";
          }
          str += stringOf(inserted);
          str += ")";
        } else {
          str = "Concat(" + self.count + ", ";
          str += addPadding(stringOf(self.first), "  ")
          str += ", " + addPadding(stringOf(self.second), "  ") + (self.replaceCount !== undefined || self.firstReuse || self.secondReuse ? ", " + self.replaceCount : "") + (self.firstReuse || self.secondReuse ? ", " + self.firstReuse + ", " + self.secondReuse : "" ) + ")";
        }
      }
      return str;
    } else if(self.ctor == Type.Custom) { // Custom
      let str = "Custom(";
      let outerPadding = toSpaces(str);
      str += addPadding(stringOf(self.subAction), outerPadding);
      str += ", " + (typeof self.lens.name == "function" ? self.lens.name() : self.lens.name) + ")";
      return str;
    } else if(self.ctor == Type.Choose) {
      var str = "Choose(";
      Collection.foreach(self.subActions, (subAction, index) => {
        str += (index == 0 ? "" : ",") + "\n" + "  " + addPadding(stringOf(subAction), "  ");
      })
      str += ")";
      return str;
    } else if(self.ctor == Type.Clone) {
      let str = "Clone(";
      let outerPadding = toSpaces(str);
      str += addPadding(stringOf(self.subAction), outerPadding);
      str += ")";
      return str;
    } else {
      return self.ctor;
    }
  }
  editActions.stringOf = stringOf;
  
  /**Proof of specification:
      apply(Reuse({k, Ek}), r@{...k: x...}, rCtx)
    = {...k: apply(Ek, x, (k, r)::rCtx)...}
    = r[0..c[ ++c r[c[.[k -> apply(Ek, x, (k, r)::rCtx)] 
    ?= r[0..c[ ++c apply(Reuse({(k-c): mapUpHere(Ek, Offset(c, n), Up(k))}), r[c..c+n[, (Offset(c, n), r)::rCtx)
    
    We need to prove that 
      r[c[.[k -> apply(Ek, x, (k, r)::rCtx)] 
    ?= r[c].[k -> apply(mapUpHere(Ek, Offset(c), Up(k)), x, (k-c, r[c[)::(Offset(c), r)::rCtx))]
    = apply(Reuse({(k-c): mapUpHere(Ek, Offset(c), Up(k))}), r[c[, (Offset(c), r)::rCtx)
    
    We need to prove that:
    apply(Ek, x, (k, r)::rCtx)
    ?= apply(mapUpHere(Ek, Offset(c), Up(k)), x, (k-c, r[c[)::(Offset(c), r)::rCtx))
    
    If we prove invariant 1) and 2) below, then for LCtx = [], we prove the equality above.
  
    Invariant:
    
    1) pathToHere consists only of Ups and always ends with a Up(k, Reuse())
    Proved inline. QED.
    
    2) Invariant to prove
    Assuming: 
      mkPath((f, x)::ctx, E) = Up(f, mkPath(ctx, E))
      mkPath([], E) = E
    
    apply(Ej, x, LCtx ++ (k, r)::rCtx)
    = apply(mapUpHere(Ej, Offset(c, n), mkPath(LCtx, Up(k))), x, LCtx ++ (k-c, r[c..c+n[)::(Offset(c, n), r)::rCtx)
  */
  // mapUpHere enables us to change the key of a Reuse statement by an offset. We change its underlying sub edit action by wrapping it up calls to the main expression to Up(the new offseted key, the offset, the edit action on the main expression)
  // A) Prepend some offset
  // apply(Ej, x, LCtx ++ (k, r)::rCtx)
  // = apply(mapUpHere(Ej, Offset(c, n, o), mkPath(LCtx, Up(k))), x, LCtx ++ (k-c, r[c..c+n[)::(Offset(c, n, o), r)::rCtx)
  // B) Remove some offset in context.
  // apply(Ej, x, LCtx ++ (k-c, r[c..c+n[)::(Offset(c, n, o), r)::rCtx)
  // = apply(mapUpHere(Ej, Offset(-c, o, n), mkPath(LCtx, Up(k))), x, LCtx ++ (k, r)::rCtx) 
  function mapUpHere(editAction, offset, pathToHere = Reuse()) {
    printDebug("mapUpHere", editAction, offset, pathToHere);
    switch(editAction.ctor) {
    case Type.Up:
      // Only the first. Guaranteed to be a key.
      let newPathToHere = Down(editAction.keyOrOffset, pathToHere);
      if(isIdentity(newPathToHere)) {
        let k = editAction.keyOrOffset;
        /** Proof of 2A)
        Ej = Up(m, X)
        newPathHere has to be identity
        i.e. Down(m, mkPath(LCtx, Up(k))) == Reuse()
        if LCtx was not [], then Down cannot compensate. Hence, LCtx = [], and furthermore, m == k
        
        apply(mapUpHere(Ej, Offset(c, n, o), mkPath(LCtx, Up(k)), x, LCtx ++ (k-c, r[c..c+n[)::(Offset(c, n, o), r)::rCtx))
        =  apply(mapUpHere(Ej, Offset(c, n, o), Up(k)), x, (k-c, r[c..c+n[)::(Offset(c, n, o), r)::rCtx))
        =  apply(Up(k-c, Offset(c, n, o), X), x, (k-c, r[c..c+n[)::(Offset(c, n, o), r)::rCtx))   -- x = r[k]
        =  apply(Up(Offset(c, n, o), X), r[c..c+n[, (Offset(c, n, o), r)::rtx))
        =  apply(X, r, rCtx)
        =  apply(Up(k, X), x, (k, r)::rCtx)
        =  apply(Ej, x, (k, r,)::rCtx)
        QED.
        
        Proof of 2B.
          apply(mapUpHere(Ej, Offset(-c, o, n), mkPath(LCtx, Up(k+c))), x, LCtx ++ (k+c, r)::rCtx)
        = apply(mapUpHere(Ej, Offset(-c, o, n), Up(k+c)), x, (k+c, r)::rCtx)
        = apply(Up(k+c, Offset(-c, o, n), X), x, (k+c, r)::rCtx)
        = apply(Up(Offset(-c, o, n), X), r, rCtx)
        = apply(Down(Offset(c, n, o), X), r, rCtx);
        = apply(X, r[c..c+n[, (Offset(c, n, o), r)::rCtx)
        = apply(Up(k, X), x, (k, r[c..c+n[)::(Offset(c, n, o), r)::rCtx)
        = apply(Ej, x, (k, r[c..c+n[)::(Offset(c, n, o), r)::rCtx)
        QED;
        */
        return Up(k-offset.count, offset, editAction.subAction);
      } else {
        /** 1) newPathToHere is not identity, so the Down did not compensate the last up of pathToHere. Since pathToHere contained only Ups, a Down(x, Up(y)) will at least produce an Up, at most cancel. And PathToHere still contains Up(k) at the end. QED */
        /** 2) 
          Ej = Up(f, X)
          
          We assume that the result of mkPath(LCtx, Up(k)) is not identity. Hence, LCtx is not empty.
          
          1. LCtx = (k', x')::LCtx'
            Thus mkPath(LCtx, Up(k)) =
                 Up(k', mkPath(LCtx', Up(k)))
                 
          apply(mapUpHere(Ej, Offset(c), mkPath(LCtx, Up(k))), x, LCtx ++ (k-c, r[c[)::(Offset(c), r)::rCtx))
          = apply(Up(f, mapUpHere(X, Offset(c), Down(f, mkPath(LCtx, Up(k))))), x, LCtx ++ (k-c, r[c[)::(Offset(c), r)::rCtx))
          = apply(Up(f, mapUpHere(X, Offset(c), Down(f, Up(k', mkPath(LCtx', Up(k)))))), x, ((k', x')::LCtx') ++ (k-c, r[c[)::(Offset(c), r, r)::rCtx)
            f has to equal k' and
          = apply(mapUpHere(X, Offset(c), mkPath(LCtx', Up(k))), x', LCtx' ++ (k-c, r[c[)::(Offset(c), r)::rCtx)
            by induction
          = apply(X, x', LCtx' ++ (k, r)::rCtx)
          = apply(Up(f, X), x, ((k', x')::LCtx') ++ (k, r)::rCtx)
          = apply(Ej, x, LCtx ++ (k, r)::rCtx)
          QED.
          
          2. where k' is an offset is probably very similar, albeit more complicated.
        */
        let newSubAction = mapUpHere(editAction.subAction, offset, newPathToHere);
        return newSubAction == editAction.subAction ? editAction : Up(editAction.keyOrOffset, mapUpHere(editAction.subAction, offset, newPathToHere));
      }
    case Type.Down: {
      /** Proof 1) the new pathToHere has one more Up, so it ends with Up(k) again and contains only Up*/
      /** Proof 2)
        Ej = Down(f, Y) where f is a key
      
        = apply(mapUpHere(Ej, Offset(c), mkPath(LCtx, Up(k))), x, LCtx ++ (k-c, r[c[)::(Offset(c), r)::rCtx)
        = apply(Down(f, mapUpHere(Y, Offset(c), Up(f, mkPath(LCtx, Up(k))))), x, LCtx ++ (k-c, r[c[)::(Offset(c), r)::rCtx)
        = apply(mapUpHere(Y, Offset(c), Up(f, mkPath(LCtx, Up(k)))), x[f], (f, x)::LCtx ++ (k-c, r[c[)::(Offset(c), r)::rCtx)
        = apply(mapUpHere(Y, Offset(c), mkPath((f, x)::LCtx, Up(k))), x[f], (f, x)::LCtx ++ (k-c, r[c[)::(Offset(c), r)::rCtx)
        = apply(Y, x[f], (f, x)::LCtx ++ (k, r)::rCtx)
        = apply(Ej, x, LCtx ++ (k, r)::rCtx)
        QED;
      */
      let newSubAction = mapUpHere(editAction.subAction, offset, Up(editAction.keyOrOffset, pathToHere));
      return newSubAction != editAction.subAction ? SameDownAs(editAction)(editAction.keyOrOffset, newSubAction) : editAction;
    }
    case Type.New: {
      /** Proof of 1) the new pathToHere has one more Up, so it ends with Up(k) again and contains only Up */
      
      /** Proof of 2)
        Ej = New({f: X})

        = apply(mapUpHere(Ej, k, Offset(c), mkPath(LCtx, Up(k))), x, LCtx ++ (k-c, r[c[)::(Offset(c), r)::rCtx)
        = apply(New({f: mapUpHere(X, k, Offset(c), mkPath(LCtx, Up(k)))}), x, LCtx ++ (k-c, r[c[)::(Offset(c), r)::rCtx)
        = {f: apply(mapUpHere(X, k, Offset(c), mkPath(LCtx, Up(k))), x, LCtx ++ (k-c, r[c[)::(Offset(c), r)::rCtx)}
        = {f: apply(X, x, LCtx ++ (k, r)::rCtx) }
        = apply(New({f: X}), x, LCtx ++ (k, r)::rCtx)
        = apply(Ej, x, LCtx ++ (k, r)::rCtx)
        QED;
      */
      let newChildEditActions = mapChildren(editAction.childEditActions, (k, v) =>  mapUpHere(v, offset, pathToHere));
      if(newChildEditActions == editAction.childEditActions) {
        return editAction;
      } else {
        return New(newChildEditActions, editAction.model);
      }
    }
    case Type.Concat: {
      /** Proof of 1) Trivial, same pathToHere */
      
      /** Proof 2) Same as New. */
      let newFirst = mapUpHere(editAction.first, offset, pathToHere);
      let newSecond = mapUpHere(editAction.second, offset, pathToHere);
      if(newFirst == editAction.first && newSecond == editAction.second) {
        return editAction;
      } else {
        return Concat(editAction.count, newFirst, newSecond, editAction.replaceCount);
      }
    }
    case Type.Custom: {
      /** 1) Trivial, same pathToHere */
      let newSubAction = mapUpHere(editAction.subAction, offset, pathToHere);
      if(newSubAction === editAction.subAction) {
        return editAction;
      } else {
        return {...editAction, subAction: newSubAction}; 
      }
    }
    case Type.Clone: {
      let newSubAction = mapUpHere(editAction.subAction, offset, pathToHere);
      if(newSubAction === editAction.subAction) {
        return editAction; 
      } else {
        return Clone(newSubAction);
      }
    }
    default: return editAction;
    }
  }
  
  // Like Up, but pushes Up to the nodes that reuse the original record.
  // Guarantees that:
  // apply(Up(k, E), r, rCtx)
  // == apply(UpIfNecessary(k, E), r, rCtx)
  function UpIfNecessary(keyOrOffset, subAction) {
    let isRaw = false, subActionOriginal = subAction;
    if(!isEditAction(subAction)) {
      subAction = New(subAction);
      isRaw = true;
    }
    if(subAction.ctor == Type.New && !isReuse(subAction)) {
      /** Proof:
        apply(UpIfNecessary(k, New({f=E})), r[k], (k, r)::rCtx)
      = apply(New({f=UpIfNecessary(k, E)}), r[k], (k, r)::rCtx)
      = {f= apply(UpIfNecessary(k, E), r[k], (k, r)::rCtx)}
      = {f= apply(Up(k, E), r[k], (k, r)::rCtx)}
      = {f = apply(E, r, rCtx)}
      = apply(New({f=E}), r, rCtx)
      = apply(Up(k, New({f=E})), r[k], (k, r)::rCtx)
      QED;
      */
      return rawIfPossible(New(mapChildren(subAction.childEditActions, (k, c) => UpIfNecessary(keyOrOffset, c)), subAction.model), isRaw);
    }
    if(subAction.ctor == Type.Concat && !isReplace(subAction)) {
      /** Proof::
         apply(UpIfNecessary(k, Concat(c, f, s)), r[k], (k, r)::rCtx)
         = apply(Concat(c, UpIfNecessary(k, f), UpIfNecessary(k, s)), r[k], (k, r)::rCtx)
         = apply(UpIfNecessary(k, f), r[k], (k, r)::rCtx) ++c apply(UpIfNecessary(k, s), r[k], (k, r)::rCtx)
         = apply(Up(k, f), r[k], (k, r)::rCtx) ++c apply(Up(k, s), r[k], (k, r)::rCtx)
         = apply(f, r, rCtx) ++c apply(s, r, rCtx)
         = apply(Concat(c, f, s), r, rCtx);
         = apply(Up(k, Concat(c, f, s)), r[k], (k, r)::rCtx)
         QED;
      */
      return Concat(subAction.count, UpIfNecessary(keyOrOffset, subAction.first), UpIfNecessary(keyOrOffset, subAction.second));
    }
    /** Proof: Trivial case*/
    return Up(keyOrOffset, subAction);
  }
  function isDown(editAction) {
    return isObject(editAction) && editAction.ctor == Type.Down;
  }
  function isPureDown(editAction) {
    return isDown(editAction) && !isRemoveExcept(editAction);
  }
  function isUp(editAction) {
    return isObject(editAction) && editAction.ctor == Type.Up;
  }
  function isPureConcat(editAction) {
    return isConcat(editAction) && !editAction.firstReuse && !editAction.secondReuse && editAction.replaceCount === undefined;
  }
  function isTracableHere(editAction) {
    //printDebug("isTracableHere",editAction);
    if(!isEditAction(editAction)) {
      return false;
    }
    if(editAction.ctor === Type.Down ||
       editAction.ctor === Type.Up) {
      return isTracableHere(editAction.subAction);
    }
    if(isReuse(editAction)) {
      return true;
    }
    if(isPureNew(editAction)) {
      return false;
    }
    if(isConcat(editAction)) {
      return isReplace(editAction) ||isTracableHere(editAction.first) || isTracableHere(editAction.second);
    }
    if(editAction.ctor === Type.Custom) {
      return true;
    }
    if(editAction.ctor === Type.Choose) {
      return Collection.firstOrDefault(
      Collection.filter(
      Collection.map(editAction.subActions, isTracableHere),
        x => x), false);
    }
    return false;
  }
  
  /** How to traverse and manipulate edit actions */
  // Low-level
  var transform = {};
  transform.isReuse = isReuse;
  transform.isNew = isNew;
  transform.isConst = isConst;
  transform.isExtend = isExtend;
  transform.isDown = isDown;
  transform.isUp = isUp;
  transform.isReplace = isReplace;
  transform.valueIfConst = valueIfConst;
  transform.isOffset = isOffset;
  transform.downDownOffset = downDownOffset;
  transform.isIdentity = isIdentity;
  // Assumes U is a New
  function forEachReusingChild(U, callback) {
    if(typeof U.model.value !== "object") {
      return;
    }
    t = treeOpsOf(U.model.value);
    forEach(U.childEditActions, (c, k) => {
      if(t.access(U.model.value, k)) {
        callback(c, k);
      }
    });
  }
  transform.isConcat = isConcat;
  transform.isPrepend = isPrepend;
  transform.isAppend = isAppend;
  function firstChildIfConcat(e) { return e.first; }
  function secondChildIfConcat(e) { return e.second; }
  function countIfConcat(e) {return e.count}
  transform.firstChildIfConcat = firstChildIfConcat;
  transform.secondChildIfConcat = secondChildIfConcat;
  transform.countIfConcat = countIfConcat;
  transform.forEachReusingChild = forEachReusingChild;
  function childIfDownOrUp(editAction, key) {
    return editAction.subAction;
  }
  transform.childIfDown = childIfDownOrUp;
  transform.childIfUp = childIfDownOrUp;
  function childIfReuse(editAction, key) {
    return key in editAction.childEditActions ? Up(key, editAction.childEditActions[key]) : Reuse();
  }
  transform.childIfReuse = childIfReuse;
  function childIfNew(editAction, key) {
    return editAction.childEditActions[key];
  }
  transform.childIfNew = childIfNew;
  function isRaw(editAction) {
    return !isEditAction(editAction);
  }
  transform.isRaw = isRaw;
  
  transform.forEachChild = forEachChild;
  transform.forAllChildren = forAllChildren;
  transform.forEach = forEach;
  transform.extractKeep = argumentsIfKeep;
  transform.extractReplace = argumentsIfReplace;
  // High-level
  function preMap(editAction, beforeMapping, inContext, afterMapping) {
    editAction = beforeMapping(editAction, inContext);
    let result = editAction;
    if(!isEditAction(editAction)) result = editAction;
    else if(editAction.ctor == Type.New) {
      if(isReuse(editAction)) {
        result = New(mapChildren(editAction.childEditActions,
        (child, k) => preMap(Up(k, child), beforeMapping, Up(k, inContext), afterMapping)), editAction.model);
      } else {
        result = New(mapChildren(editAction.childEditActions,
        (child, k) => preMap(child, beforeMapping, inContext, afterMapping)), editAction.model);
      }
    }
    else if(editAction.ctor == Type.Down) {
      result = SameDownAs(editAction)(
        editAction.keyOrOffset, preMap(editAction.subAction, beforeMapping, Up(editAction.keyOrOffset, inContext), afterMapping));
    }
    else if(editAction.ctor == Type.Up) {
      result = Up(editAction.keyOrOffset, preMap(editAction.subAction, beforeMapping, Down(editAction.keyOrOffset, inContext), afterMapping));
    }    
    else if(editAction.ctor == Type.Concat) {
      let newFirst = preMap(editAction.first, beforeMapping, inContext, afterMapping);
      let newSecond = preMap(editAction.second, beforeMapping, inContext, afterMapping);
      let newFirstLength = outLength(newFirst);
      if(newFirstLength === undefined || "previousFirst" in editAction) newFirstLength = editAction.count;
      result = Concat(newFirstLength, newFirst, newSecond, editAction.replaceCount, editAction.firstReuse, editAction.secondReuse);
      if("previousFirst" in editAction) {
        result.previousFirst = editAction.previousFirst;
      }
    }
    else if(editAction.ctor == Type.Custom) {
      let newSub = preMap(editAction.subAction, beforeMapping, inContext, afterMapping);
      result = Custom(newSub, editAction.lens);
    }
    else if(editAction.ctor == Type.Choose) {
      let newSubs = Collection.map(editAction.subActions, subAction => preMap(subAction, beforeMapping, inContext, afterMapping));
      result = Choose(newSubs);
    }
    if (afterMapping != undefined) {
      result = afterMapping(result, inContext);
    }
    return result;
  }
  transform.preMap = preMap;
  editActions.transform = transform;
  
  function StartArray() {
    let a = {
      result: undefined,
      objectToModify: undefined,
      keyToModify: undefined,
      update(tmp) {
        if(this.result === undefined) {
          this.result = tmp; 
        } else {
          if(Array.isArray(this.keyToModify)) {
            this.objectToModify[this.keyToModify[0]][this.keyToModify[1]] = tmp;
          } else {
            this.objectToModify[this.keyToModify] = tmp;
          }
        }
        return tmp;
      },
      Remove(n) {
        if(n === 0) return this;
        let tmp = Remove(n);
        this.update(tmp);
        this.objectToModify = tmp;
        this.keyToModify = "subAction";
        return this;
      },
      PrependNonEmpty(n, toPrepend) {
        if(n == 0) return this;
        return this.Prepend(n, toPrepend);
      },
      Prepend(n, toPrepend) {
        let tmp = {ctor: Type.Concat, count: n, first: toPrepend, second: Reuse(), replaceCount: undefined, firstReuse: false, secondReuse: true};
        this.update(tmp);
        this.objectToModify = tmp;
        this.keyToModify = "second";
        return this;
      },
      ConcatNonEmpty(n, first) {
        if(n == 0) return this;
        return this.Concat(n, first);
      },
      Concat(n, first) {
        let tmp = {ctor: Type.Concat, count: n, first: first, second: Reuse(), replaceCount: undefined, firstReuse: false, secondReuse: false};
        this.update(tmp);
        this.objectToModify = tmp;
        this.keyToModify = "second";
        return this;
      },
      Replace(inLength, outLength, edit) {
        let tmp = {ctor: Type.Concat, count: outLength, first: Down(Interval(0, inLength), edit), second: Down(Interval(inLength)), replaceCount: inLength, firstReuse: false, secondReuse: false};
        this.update(tmp);
        this.objectToModify = tmp.second;
        this.keyToModify = "subAction";
        return this;
      },
      Keep(n) {
        return this.Replace(n, n, Reuse());
      },
      Reuse(childEditActions, keyToModify) {
        let tmp = Reuse(childEditActions);
        this.update(tmp);
        tmp.childEditActions[keyToModify] = Down(keyToModify);
        this.objectToModify = tmp.childEditActions[keyToModify];
        this.keyToModify = "subAction";
        return this;
      },
      New(childEditActions, keyToModify) {
        let tmp = New(childEditActions);
        this.update(tmp);
        this.objectToModify = tmp.childEditActions;
        this.keyToModify = keyToModify;
        return this;
      },
      Extend(childEditActions, keyToModify) {
        let tmp = Extend(childEditActions);
        this.update(tmp);
        this.objectToModify = tmp.childEditActions;
        this.keyToModify = keyToModify;
        return this;
      },
      Up(keyOrOffset) {
        let tmp = Up(keyOrOffset);
        this.update(tmp);
        this.objectToModify = tmp;
        this.keyToModify = "subAction";
        return this;
      },
      Down(keyOrOffset) {
        let tmp = Down(keyOrOffset);
        this.update(tmp);
        this.objectToModify = tmp;
        this.keyToModify = "subAction";
        return this;
      },
      Remove(keyOrOffset) {
        let tmp = Remove(keyOrOffset);
        this.update(tmp);
        this.objectToModify = tmp;
        this.keyToModify = "subAction";
        return this;
      },
      RemoveExcept(keyOrOffset) {
        let tmp = RemoveExcept(keyOrOffset);
        this.update(tmp);
        this.objectToModify = tmp;
        this.keyToModify = "subAction";
        return this;
      },
      EndArray() {
        return this.result === undefined ? Reuse() : this.result;
      },
      EndArraySimplify() {
        return this.result === undefined ? Reuse() : firstRewrite(this.result);
      }
    };
    return a;
  }
  editActions.StartArray = StartArray;
  
})(editActions)

if(typeof module === "object") {
  module.exports = editActions;
}
