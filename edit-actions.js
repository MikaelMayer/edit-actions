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
  
  var Type = {
     Up: "Up",       // Navigate the tree
     Down: "Down",
     New: "New",     // Create a new tree
     Concat: "Concat", // Concatenates two instances of monoids.
     Custom: "Custom",
     UseResult: "UseResult", // Not supported for andThen, backPropagation and merge.
     Choose: "Choose", // Alternative choice options
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
    Reuse: "Reuse",
    Insert: "Insert"
  }
  // Create means that, during back-propagation, we keep the changes of the interpreter edit action (by default). Else, we just replace an interpreter's Reuse by Reuse();
  function ReuseModel(create = false) {
    return {ctor: TypeNewModel.Reuse, create};
  }
  editActions.ReuseModel = ReuseModel;
  function InsertModel(value) {
    if(arguments.length == 0) value = {};
    return {ctor: TypeNewModel.Insert, value};
  }
  editActions.InsertModel = InsertModel;
  
  /* apply(New(1), x) = 1                 */
  /* apply(New({0: New(2)}, []), x) = [2] */
  /* apply(New([Reuse()]), x) = [x]       */
  function New(childEditActions, model) {
    if(arguments.length == 0) {
      return New({}, InsertModel(undefined));
    }
    if(arguments.length == 1) {
      if(typeof childEditActions == "object") {
        return New(childEditActions, InsertModel(Array.isArray(childEditActions) ? [] : {}));
      } else {
        return New({}, InsertModel(childEditActions));
      }
    }
    if(isObject(model) && !(model.ctor in TypeNewModel)) {
      model = InsertModel(model);
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
  
  function isPathElement(elem) {
    return typeof elem == "string" || typeof elem == "number" || isOffset(elem);
  }
  
  function Up(keyOrOffset, subAction) {
    if(arguments.length == 1) subAction = Reuse();
    let subActionIsPureEdit = isEditAction(subAction);
    if(arguments.length > 2 || arguments.length == 2 && !subActionIsPureEdit && isPathElement(subAction)) {
      return Up(arguments[0], Up(...[...arguments].slice(1)));
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
  editActions.Up = Up;
  
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
          if(ik && (keyOrOffset.count < 0 || keyOrOffset.count === 0 && !LessThanEqualUndefined(keyOrOffset.newLength, keyOrOffset.oldLength))) {
            // Flip to up.
            let newUpOffset = downToUpOffset(keyOrOffset);
            console.trace("/!\\ Warning, Down() was given an incorrect offset. Converting it to up. "+keyOrOffsetToString(keyOrOffset)+"=>"+keyOrOffsetToString(newUpOffset));
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
      if(isNew(first) && isNew(second)) {
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
    if(secondReuse && !firstReuse) {
      // A prepend. Maybe the second one is an prepend?
      if(isNew(first) && isPrepend(second) && isNew(second.first)) {
        let optimizedConcat = optimizeConcatNew(first, second.first, firstWasRaw, undefined);
        if(optimizedConcat !== undefined) {
          return Prepend(count + second.count, optimizedConcat, second.second);
        }
      }
    }
    if(firstReuse && !secondReuse) {
      if(isNew(second) && isAppend(first) && isNew(first.second)) {
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
       let output = ap(input, r, rCtx);
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
         // TODO: Test this
         let UBeforeSecond = backPropagate(secondAction, U, firstActionContext);
         // Top-level needs top-level propagation.
         let [E, initUp] = originalFirstActionAndContext(firstAction, firstActionContext);
         return backPropagate(E, UBeforeSecond, initUp);
       },
      name: () => "Follow this by " + stringOf(secondAction) + " under " + stringOf(firstActionContext)});
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
    switch(editAction.ctor) {
      case Type.New:
        return New(mapChildren(editAction.childEditActions, (k, c) => first(c)), editAction.model);
      case Type.Concat:
        return Concat(editAction.count, first(editAction.first), first(editAction.second), editAction.replaceCount, editAction.firstReuse, editAction.secondReuse);
      case Type.Up:
        return Up(editAction.keyOrOffset, first(editAction.subAction));
      case Type.Down:
        return SameDownAs(editAction)(editAction.keyOrOffset, first(editAction.subAction));
      case Type.Choose:
        return first(Collection.firstOrDefault(editAction.subActions, Reuse()));
      default:
        return editAction;
    }
  }
  editActions.first = first;
  
  //// HELPERS and syntactic sugar:
  // Reuse, Replace, Interval Prepend, Keep, Remove, RemoveAll, RemoveExcept
 
  // apply(Reuse({a: New(1)}), {a: 2, b: 3}) = {a: 1, b: 3}
  function Reuse(childEditActions) {
    let newChildEditActions = mapChildren(
      childEditActions, (k, c) => Down(k, c),
      /*canReuse*/false,
      (newChild, k) => !isObject(newChild) || newChild.ctor !== Type.Down || newChild.keyOrOffset !== k || !isIdentity(newChild.subAction)
      );
    return New(newChildEditActions, ReuseModel(false));
  }
  editActions.Reuse = Reuse;
  
  function ReuseAsIs(childEditActions) {
    let newChildEditActions = mapChildren(
      childEditActions, (k, c) => typeof c != "object" ? Down(k, New(c)) : Down(k, c),
      /*canReuse*/false,
      (newChild, k) => !isObject(newChild) || newChild.ctor !== Type.Down || newChild.keyOrOffset !== k || !isIdentity(newChild.subAction)
      );
    return New(newChildEditActions, ReuseModel(true));
  }
  editActions.ReuseAsIs = ReuseAsIs;
  
  // A constant, useful for pretty-printing
  var WRAP = true;
  editActions.WRAP = WRAP;
  var NEW = true;
  editActions.NEW = NEW;
  // The intent is that the element at key is the one that reuses the original record.
  // If no key is provided
  function Insert(key, childEditActions) {
    if(!isObject(childEditActions)) return New(childEditActions);
    let treeOps = treeOpsOf(childEditActions);
    let modelValue = treeOps.init();
    treeOps.update(modelValue, key, WRAP);
    return New(childEditActions, InsertModel(modelValue));
  }
  editActions.Insert = Insert;
  
  function InsertAll(childEditActions) {
    if(!isObject(childEditActions)) return New(childEditActions);
    let treeOps = treeOpsOf(childEditActions);
    let modelValue = treeOps.init();
    treeOps.forEach(childEditActions, (c, k) => {
      treeOps.update(modelValue, k, WRAP);
    });
    return New(childEditActions, InsertModel(modelValue));
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
  
  // first is the thing to prepend (in the current context of the slice), second is the remaining (default is Reuse()).
  function Prepend(count, first, second = Reuse()) {
    return Concat(count, first, second, undefined, false, true);
  }
  function Append(count, first, second) {
    if(arguments.length == 2) {
      second = first;
      first = Reuse();
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
  // Remove back-propagates deletions, not building up the array. To build up the array, prefix the Replace with a Down(Offset(0, totalLength, undefined), 
  function Remove(count, subAction = Reuse()) {
    return RemoveExcept(Offset(count), subAction);
    // return Down(Offset(count), subAction); 
    // return Replace(count, 0, New(?), subAction)
  }
  editActions.Remove = Remove;
  
  function RemoveAll(subAction, oldLength) {
    if(isEditAction(oldLength) || typeof subAction == "number") {
      let tmp = subAction;
      subAction = oldLength;
      oldLength = tmp;
    }
    if(subAction === undefined) {
      subAction = Reuse();
    }
    return RemoveExcept(Offset(0, 0, oldLength), subAction);
  }
  editActions.RemoveAll = RemoveAll;
  
  // ReuseOffset(offset, X) is to Down(offset, X)
  // what Reuse({key: X}) is to Down(key, X)
  // Specification:
  // apply(ReuseOffset(Offset(c, n, o), replaced, subAction), r, rCtx)
  // = apply(Down(Offset(0, c, o)), r, rCtx) ++c apply(subAction, r[c..c+n], (Offset(c, n, o), r):: rCtx) ++replaced apply(Down(Offset(c+n, o-(c+n), o)), r, rCtx)
  function ReuseOffset(offset, replaced, subAction) {
    if(offset.newLength !== undefined) {
      if(typeof subAction === "undefined" && isEditAction(replaced)) {
        subAction = replaced;
        replaced = outLength(subAction, offset.newLength);
        if(replaced === undefined) {
          console.log("/!\\ In ReuseOffset, could not infer the length of " + stringOf(subAction) + " even on the context of length " + offset.newLength + ". Will assume the context's length.");
          replaced = offset.newLength;
        }
      }
      let wrapped = subAction;
      if(replaced === 0) {
        wrapped = Remove(offset.newLength);
      } else { // replaced > 0
        if(offset.newLength > 0) {
          wrapped = Replace(offset.newLength, replaced, wrapped);
        } else {
          if(!isPrepend(wrapped)) {
            wrapped = Prepend(replaced, wrapped);
          }
        }
      }
      if(offset.count > 0) {
        wrapped = Keep(offset.count, wrapped);
      }
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
    } else {
      if(typeof subAction === "undefined" && isEditAction(replaced)) {
        subAction = replaced;
      }
      return Keep(offset.count, subAction);
    }
  }
  editActions.ReuseOffset = ReuseOffset;
  function ReuseKeyOrOffset(keyOrOffset, subAction) {
    if(isOffset(keyOrOffset)) {
      return ReuseOffset(keyOrOffset, subAction);
    } else {
      return Reuse({[keyOrOffset]: subAction});
    }
  }
  editActions.ReuseKeyOrOffset = ReuseKeyOrOffset;
  
  function isRemove(editAction) {
    return isRemoveExcept(editAction) && editAction.keyOrOffset.newLength === undefined;
  }
  function isPrepend(editAction) {
    return typeof editAction == "object" && editAction.ctor == Type.Concat && editAction.secondReuse && !editAction.firstReuse && editAction.replaceCount === undefined;
  }
  function isAppend(editAction) {
    return typeof editAction == "object" && editAction.ctor == Type.Concat && editAction.firstReuse && !editAction.secondReuse && editAction.replaceCount === undefined;
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
    return Offset(offset1.count + offset2.count, offset1.newLength, offset2.oldLength);
  }
  // Might not work if the new given length is larger than the given old length
  function upToDownOffset(offset) {
    if(offset.count <= 0 && LessThanEqualUndefined(offset.oldLength, offset.newLength)) {
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
  
  // Applies the edit action to the given program/context
  function apply(editAction, prog, ctx, resultCtx) {
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
      /*return Collection.map(editAction.subActions, subAction =>
        apply(subAction, prog, ctx, resultCtx)
      );*/
    }
    let isReuse = editAction.model.ctor == TypeNewModel.Reuse;
    let isNew = !isReuse;
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
  editActions.apply = apply;
  
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
      
    if(secondAction.ctor == Type.Choose) {
      return Choose(...Collection.map(secondAction.subActions, subAction => andThen(subAction, firstActionOriginal, firstActionContext)));
    } else if(firstAction.ctor == Type.Choose) {
      return Choose(...Collection.map(firstAction.subActions, subAction => andThen(secondActionOriginal, subAction, firstActionContext)));
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
          //printDebug("First replace", fi, fc, lf, rf);
          let [os, ls, rs] = splitIn(fc, secondAction);
          //printDebug("Second replace", os, ls, rs);
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
      if(isReuse(firstAction)) {
        /** Proof (key, context does not contain offset)
          apply(andThen(Reuse({f: E2}), Reuse({f: E1}), E2Ctx), {...f: x...}, rCtx)
        = apply(Reuse({f: andThen(E2, E1, Up(f, (f, Reuse({f: E1}))::E2Ctx))}), {...f: x...}, rCtx)   -- AndThen-Copy-Copy
        = {...f: apply(andThen(E2, E1, Up(f, (f, Reuse({f: E1}))::E2Ctx)), X, (f, {...f: x...})::rCtx)...}  -- Copy
        =  {...f: apply(E2, apply(E1, x, (f, {...f: x...})::rCtx), apply(Up(f, (f, Reuse({f: E1}))::E2Ctx), x, (f, {...f:x...})::rCtx)...}  -- IND
        =  {...f: apply(E2, apply(E1, x, (f, {...f: x...})::rCtx), apply((f, Reuse({f: E1}))::E2Ctx, {...f:x...}, rCtx))...} -- UP
        =  {...f: apply(E2, apply(E1, x, (f, {...f: x...})::rCtx), (f, apply(Reuse({f: E1}),  {...f: x...}, rCtx))::apply(E2Ctx, {...f:x...}, rCtx))...} -- NEW x 2
        =  {...f: apply(E2, apply(E1, x, (f, {...f: x...})::rCtx), (f, {...f: apply(E1, x, (f, {...f: x...})::rCtx)...})::apply(E2Ctx, {...f: x...}, rCtx))...} -- Copy
        = apply(Reuse({f: E2}), {...f: apply(E1, x, (f, {...f: x...})::rCtx)...}, apply(E2Ctx, {...f: x...}, rCtx)) -- Copy
   GOAL = apply(Reuse({f: E2}), apply(Reuse({f: E1}), {...f: x...}, rCtx), apply(E2Ctx, {...f: x...}, rCtx));
        QED.
        */
        
        /** Unproof (key, context contain offset)
          apply(andThen(Reuse({f: E2}), Reuse({f: E1}), (Offset(a, n), E0, X)::E2Ctx), {...f: x...}, rCtx)
        = apply(Reuse({f: andThen(E2, E1, (f+a, E0, Up(f, X))::E2Ctx)}), {...f: x...}, rCtx)   -- AT-REU 
        = {...f: apply(andThen(E2, E1, (f+a, E0, Up(f, X))::E2Ctx), X, (f, {...f: x...})::rCtx)...}  -- AP-REU
        = {...f: apply(E2, apply(E1, x, (f, {...f: x...})::rCtx), apply((f+a, E0, Up(f, X))::E2Ctx, x, (f, {...f:x...})::rCtx)...}        
        = {...f: apply(E2, apply(E1, x, (f, {...f: x...})::rCtx), apply((f+a, E0, X)::E2Ctx, {...f:x...}, rCtx))...}
        Problem: Got (f+a, E0, X)::E2Ctx instead of (f, Reuse({f: E1}), Reuse())::(Offset(a, n), E0, X)::E2Ctx
        
        = {...f: apply(E2, apply(E1, x, (f, {...f: x...})::rCtx), apply((f, Reuse({f: E1}), Reuse())::(Offset(a, n), E0, X)::E2Ctx, {...f: x...}, rCtx))...}
        = {...f: apply(E2, apply(E1, x, (f, {...f: x...})::rCtx), (f, apply(Reuse({f: E1}), {...f: x...}, rCtx))::apply((Offset(a, n), E0, X)::E2Ctx, {...f: x...}, rCtx))...}
        = {...f: apply(E2, apply(E1, x, (f, {...f: x...})::rCtx), (f, {...f:apply(E1, x, (f, {...f: x})::rCtx)...})::apply((Offset(a, n), E0, X)::E2Ctx, {...f: x...}, rCtx))...};
        = apply(Reuse({f: E2}), {...f:apply(E1, x, (f, {...f: x})::rCtx)...}, apply((Offset(a, n), E0, X)::E2Ctx, {...f: x...}, rCtx));
   GOAL = apply(Reuse({f: E2}), apply(Reuse({f: E1}), {...f: x...}, rCtx), apply((Offset(a, n), E0, X)::E2Ctx, {...f: x...}, rCtx));
        QED.
        */
        let newChildren = {};
        forEach(firstAction.childEditActions, (firstChild, k) => {
          if(k in secondAction.childEditActions) {
            let secondChild = secondAction.childEditActions[k];
            let newCtx = AddContext(k, firstActionOriginal, firstActionContext);
            if(editActions.__debug) {
              console.log("Inside Reuse({ " + k + ": ");
            }
            newChildren[k] = recurse(Up(k, secondChild), firstChild, newCtx);
          } else {
            newChildren[k] = firstChild;
          }
        })
        forEach(secondAction.childEditActions, (secondChild, k) => {
          if(!(k in firstAction.childEditActions)) {
            if(editActions.__debug) {
              console.log("Inside Reuse({ " + k + ": ");
            }
            newChildren[k] = recurse(Up(k, secondChild), Down(k), AddContext(k, firstActionOriginal, firstActionContext));
          }
        });
        return New(newChildren, ReuseModel(secondAction.model.create || firstAction.model.create));
      } else if(firstAction.ctor == Type.New) {
        // Not a Reuse
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
        forEachChild(firstAction, (firstChild, k) => {
          if(k in secondAction.childEditActions) {
            let secondChild = secondAction.childEditActions[k];
            if(editActions.__debug) {
              console.log("Inside New({ " + k + ": ");
            }
            newChildren[k] = recurse(Up(k, secondChild), firstChild, AddContext(k, firstActionOriginal, firstActionContext));
          } else {
            newChildren[k] = firstChild;
          }
        });
        forEach(secondAction.childEditActions, (secondChild, k) => {
          if(!(k in firstAction.childEditActions)) {
            newChildren[k] = recurse(Up(k, secondChild), New(undefined), AddContext(k, firstActionOriginal, firstActionContext));
          }
        });
        return rawIfPossible(New(newChildren, firstAction.model), isFirstRaw);
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
        let newFirst = recurse(New(leftChildren, ReuseModel()), firstAction.first, AddContext(Offset(0, firstAction.count), firstActionOriginal, firstActionContext));
        if(editActions.__debug) {
          console.log("Inside right of Concat(" + firstAction.count, ", ..., |)");
        }
        let newSecond = recurse(New(rightChildren, ReuseModel()), firstAction.second, AddContext(Offset(firstAction.count), firstActionOriginal, firstActionContext));
        
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
       if(!isOffset(keyOrOffset)) {
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
    // !isOffset(upKeyOrOffset)
    if(isOffset(keyOrOffset)) { // We just skip it.
      return walkUpActionCtx(upKeyOrOffset, newFirstAction, newFirstActionContext);
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
      editAction.model.ctor == TypeNewModel.Reuse ? Down(key) : New(undefined);
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
  
  /** Given an operation of array, ensures it can be splitIn at the given index n.
    
    Ensures applyZ(editAction, rrCtx) = applyZ(result, rrCtx)    
  */
  function makeSplitInCompatibleAt(n, editAction) {
    if(isReuse(editAction)) return editAction;
    if(editAction.ctor == Type.Concat) {
      let [inCount1, outCount1, left1, right1] = argumentsIfReplace(editAction);
      if(right1) {
        if(inCount1 == n) return editAction;
        if(inCount1 < n) return Replace(inCount1, outCount1, left1, makeSplitInCompatibleAt(n-inCount1, right1));
        if(inCount1 > n) return Replace(inCount1, outCount1, makeSplitInCompatibleAt(n, left1), right1);
      } else if(editAction.firstReuse || editAction.secondReuse) { // An Append or a Prepend
        if(editAction.secondReuse) {
          return Prepend(editAction.count, editAction.first, makeSplitInCompatibleAt(editAction.second));
        } else if(editAction.firstReuse) {
          return Append(editAction.count, makeSplitInCompatibleAt(editAction.first), editAction.second);
        }
      } else {
        // Not a Replace, nor an prepend or an Append. We just treat it like an prepend.
        return Prepend(outCount1, editAction.first, makeSplitInCompatibleAt(editAction.second));
      }
    } else if(isRemoveExcept(editAction)) {
      let {keyOrOffset: {count, newLength, oldLength}, subAction: e} = editAction;
      return RemoveExcept(editAction.keyOrOffset, makeSplitInCompatibleAt(n-count, e));
    } else { // New, regular Down, Up, Concat
      return RemoveAll(Prepend(outLength(editAction), Up(Offset(0, 0), editAction)))
    }
  }
  
  // splitIn works only for any combination of Replace, Reuse and RemoveExcept
  // Replace(0, x, I, E) will also work because
  //   if n == 0, then it will just return editAction.
  //   if n > 0, then inCount < n and thus, only right is split.
  // Hence splitIn works for Prepend and Keep as well!
  
  // If [outCount, left, right] = splitIn(inCount, editAction)
  // Then
  // apply(Replace(inCount, outCount, left, right), r, rCtx) = apply(editAction, r, rCtx)
  function splitIn(n, editAction, contextCount = undefined) {
    printDebug("splitIn", n, editAction);
    if(n == 0) {
      /** Proof:
            apply(Replace(0, 0, Reuse(), editAction), r, rCtx)
          = apply(Down(Offset(0, 0)), r, rCtx) ++0 apply(Down(Offset(0), editAction), r, rCtx)
          = [] ++0 apply(editAction, r, rCtx)
          = apply(editAction, r, rCtx)
          QED
      */
      return [0, Reuse(), editAction];
    }
    let [inCount, outCount, left, right] = argumentsIfReplace(editAction);
    if(right !== undefined) {
      if(inCount == n) {
        return [outCount, left, right]
      } else if(inCount < n) {
        let [outCount2, right1, right2] = splitIn(n-inCount, right, MinusUndefined(contextCount, outCount));
        if(right2 === undefined) return [];
        /** Proof:
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
        return [outCount2+outCount, Replace(inCount, outCount, left, right1), right2];
      } else { // inCount > n
        let [outCount2, left1, left2] = splitIn(n, left, outCount); 
        if(left2 === undefined) return [];
        /** Proof:
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
        return [outCount2, left1, Replace(inCount - n, outCount-outCount2, left2, right)];
      }
    }
    if(isPrepend(editAction)) {
      let [o2, l2, r2] = splitIn(n, editAction.second);
      if(r2 !== undefined) {
        return [o2 + editAction.count, Prepend(editAction.count, editAction.first, l2), r2];
      }
    }
    if(isAppend(editAction)) {
      let [o2, l2, r2] = splitIn(n, editAction.first);
      if(r2 !== undefined) {
        return [o2, l2, Append(editAction.count, r2, editAction.second)]
      }
    }
    if(isReuse(editAction)) {
      // Let's generate a Replace to mimic the Reuse.
      /** Proof: Assume editAction = Reuse({f: Ef, g: Eg}) where f < n and g >= n
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
      let lefto = {};
      let righto = {};
      forEachChild(editAction, (child, k) => {
        if(k < n) {
          lefto[k] = mapUpHere(Up(k, child), Offset(0, n), Up(k));
        } else {
          righto[k-n] = mapUpHere(Up(k, child), Offset(n), Up(k));
        }
      });
      return [n, Reuse(lefto), Reuse(righto)];
    }
    if(isRemoveExcept(editAction)) {
      let {count: c, newLength: l, oldLength: o} = editAction.keyOrOffset;
      if(c >= n) {
      /** Proof: Assume editAction = Down(Offset(c, l, o), E) where c >= n
         apply(editAction, r, rCtx)
       = apply(Down(Offset(c, l, o), E), r, rCtx);
       = apply(Down(Offset(0, n), Down(Offset(0, 0, n))), r, rCtx) ++0
         apply(Down(Offset(n), Down(Offset(c-n, l, o-n), E)), r, rCtx);
       = apply(Replace(n, 0, Down(Offset(0, 0, n)), Down(Offset(c-n, l, o-n), E)), r, rCtx)
       QED;
      */
        return [0, RemoveAll(n), RemoveExcept(Offset(c - n, l, MinusUndefined(o, n)), editAction.subAction)];
      } else if(l !== undefined && c + l <= n) {
        /** Proof:Assume editAction = Down(Offset(c, l, o), E) where c+l <= n
            apply(editAction, r, rCtx)
          = apply(Down(Offset(c, l, o), E), r, rCtx)
          = apply(Down(Offset(0, n), Down(Offset(c, l, n), E)), r, rCtx)
            ++? apply(Down(Offset(n), Down(Offset(0, 0))), r, rCtx) 
          = apply(Replace(n, ?, Down(Offset(c, l, n), E), Down(Offset(0, 0))), r, rCtx)
          QED
        */
        let leftLength = contextCount !== undefined ? contextCount : outLength(editAction);
        printDebug("leftLength", leftLength);
        if(leftLength !== undefined) {
          return [leftLength, editAction, RemoveAll()];
        }
      } else { // Hybrid
        /** Proof:Assume editAction = Down(Offset(c, l, o), E) where c < n and n < c+l
            let [o1, l1, r1] = splitIn(n - c, E)
            then apply()
        
            apply(editAction, r, rCtx)
          = apply(Down(Offset(c, l, o), E), r, rCtx)
          = apply(E, r[c..c+l], (Offset(c, l, o), r)::rCtx)
          = apply(Replace(n-c, o1, l1, r1), r[c..c+l], (Offset(c, l, o), r)::rCtx)
          = apply(Concat(o1, Down(Offset(0, n-c, l), l1), Down(Offset(n-c, l-(n-c), l), r1)), r[c..c+l], (Offset(c, l, o), r)::rCtx)
          = apply(Down(Offset(c, l, o), Concat(o1, Down(Offset(0, n-c, l), l1), Down(Offset(n-c, l-(n-c), l), r1))), r, rCtx)
          = apply(Concat(o1, Down(Offset(c, l, o), Down(Offset(0, n-c, l), l1)), Down(Offset(c, l, o), Down(Offset(n-c, l-(n-c), l), r1))), r, rCtx)
          = apply(Concat(o1, Down(Offset(c, n-c, o), l1), Down(Offset(c+n-c, l-(n-c), o), r1)), r, rCtx)
          = apply(Concat(o1, Down(Offset(c, n-c, o), l1), Down(Offset(n, l-(n-c), o), r1)), r, rCtx)
          = apply(Concat(o1, Down(Offset(0, n), Down(Offset(c, n-c, o), l1)), Down(Offset(n), Down(Offset(0, l-(n-c), o), r1))), r, rCtx)
          = apply(Replace(n, o1, Down(Offset(c, n-c, o), l1), Down(Offset(0, l-(n-c), o), r1)), r, rCtx)
          QED
        */
        let [o1, l1, r1] = splitIn(n - c, editAction.subAction, contextCount);
        if(r1 !== undefined) {
          return [o1, RemoveExcept(Offset(c, n - c, o), l1), RemoveExcept(Offset(0, MinusUndefined(l, (n-c)), o), r1)];
        }
      }
    }
    // TODO: Deal with Choose. Change splitIn to a generator?
    /*if(editAction.ctor == Type.Choose) {
      // Return a Choose.
      return Choose(Collection.map(editAction.subActions, splitIn));
    }*/
    return []
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
  function keyOrOffsetIn(keyOrOffset, editAction) {
    if(isOffset(keyOrOffset)) return offsetIn(keyOrOffset, editAction);
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
        if(key < count) return Up(key, editAction); // Default case, proof below
        if(newLength !== undefined && key >= count + newLength) return Up(key, editAction); // Default case, proof below
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
        return mapUpHere(keyIn(key-c, X), Offset(-c, o, l), Up(key));
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
          return Up(key, editAction); // Default case, we cannot do otherwise.
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
    return Up(key, editAction);
  }
  
  // If e = offsetIn(offset, editAction)
  // Then, for some X and Y
  // apply(editAction, r, rCtx) =
  // apply(Down(before(offset), x), r, rctx) ++ apply(Down(offset, e), r, rCtx) ++ apply(Down(after(offset), Y), r, rCtx)
  function offsetIn(offset, editAction) {
    printDebug("offsetIn", offset, editAction);
    let {count, newLength} = offset;
    let [o2, l2, r2] = splitIn(count, editAction);
    if(r2 === undefined) { // Recovery mode
      printDebug("offsetIn recovery Left", count, editAction);
      let newEditAction = toSplitInCompatibleAt(editAction, count);
      printDebug("Recoverty to split at ", newEditAction);
      [o2, l2, r2] = splitIn(count, newEditAction);
    }
    printDebug("OffsetIn-Splitted Left", o2, l2, r2);
    if(newLength !== undefined && r2 !== undefined) {
      let [o3, l3, r3] = splitIn(newLength, r2);
      if(l3 === undefined) { // Recovery mode
        printDebug("offsetIn recovery Right", newLength, r2);
        let newr2 = toSplitInCompatibleAt(r2, newLength);
        printDebug("Recoverty to split at ", newr2);
        [o3, l3, r3] = splitIn(newLength, r2);
      }
      printDebug("OffsetIn-Splitted Right", o3, l3, r3);
      /** Proof
        apply(editAction, r, rCtx)
       = apply(Replace(offset.count, o2, l2, r2), r, rCtx)
       = apply(Down(Offset(0, offset.count), l2), r, rCtx) ++o2 apply(Down(offset.count, r2), r, rCtx)
       = apply(Down(Offset(0, offset.count), l2), r, rCtx) ++o2 apply(r2, r[offset.count...], (Offset(offset.count), r)::rCtx)
       = apply(Down(Offset(0, offset.count), l2), r, rCtx) ++o2 (apply(Down(Offset(0, newLength), l3), r[offset.count...], (Offset(offset.count), r)::rCtx) ++o3 apply(Down(Offset(newLength, r3), r[offset.count...], (Offset(offset.count), r)::rCtx)))
       = apply(Down(Offset(0, offset.count), l2), r, rCtx) ++o2 (apply(Down(Offset(Offset(count), Offset(0, newLength), l3)), r, rCtx) ++o3 apply(Down(Offset(newLength, r3), r[offset.count...], (Offset(offset.count), r)::rCtx)))
       = apply(Down(Offset(0, offset.count), l2), r, rCtx) ++o2 (apply(Down(offset, l3), r, rCtx) ++o3 apply(Down(Offset(offset.count + offset.newLength), r3), r, rCtx))
       QED for X = l2 and Y = r3
      */
      if(l3 !== undefined) {
        return l3;
      } else {
        return Up(offset, editAction);
      }
    }
    /** Proof:
       We obtain from the spec of splitIn that:
         apply(editAction, r, rCtx)
       = apply(Replace(offset.count, o2, l2, r2), r, rCtx)
       = apply(Down(Offset(0, offset.count), l2), r, rCtx) ++o2 apply(Down(offset, r2), r, rCtx)
       QED; with X = l2
    */
    if(r2 !== undefined) {
      return r2;
    } else {
      return Up(offset, editAction);
    }
  }

  // if [left, right] = splitAt(count, editAction)
  // Then
  //
  // apply(left, r, rCtx) ++count apply(right, r, rCtx))
  // = apply(editAction, r, rCtx);
  function splitAt(count, editAction, isRemove) {
    if(editActions.__debug) {
      console.log("splitAt(", count, "," , stringOf(editAction), ",", isRemove, ")")
    }
    if(count == 0) {
      /**
      Proof:
        applyZ(Down(Offset(0, 0)), rrCtx) ++0 applyZ(editAction, rrCtx)
        = applyZ(editAction, rrCtx)
      */
      return [SameDownAs(isRemove)(Offset(0, 0)), editAction];
    }
    var left, right;
    var wasRaw = false;
    if(!isEditAction(editAction)) {
      wasRaw = true;
      editAction = New(editAction);
    }
    switch(editAction.ctor) {
    case Type.New:
      if(isReuse(editAction)) {
        /** n = count
          Proof: (f < n, g >= n)
          editAction: Reuse({f: Ef, g: Eg})
          left: Down(Offset(0, n), Reuse({f: Up(f, Offset(0, n), Down(f, Ef))}))
          right: Down(Offset(n), Reuse({(g-n): Up(g-n, Offset(n), Down(g, Eg))}))
          r = {...f: x...g: y...}
          
          apply(left, r, rCtx) ++n apply(right, r, rCtx))
          = apply(Down(Offset(0, n), Reuse({f: Up(f, Offset(0, n), Down(f, Ef))})), {...f: x...g: y...}, rCtx) ++ apply(Down(Offset(n), Reuse({(g-n): Up(g-n, Offset(n), Down(g, Eg))})), {...f: x...g: y...}, rCtx)
          = apply(Reuse({f: Up(f, Offset(0, n), Down(f, Ef))}), {...f: x.}, (Offset(0, n), {...f: x...g: y...})::rCtx) ++ apply(Reuse({(g-n): Up(g-n, Offset(n), Down(g, Eg))}), {..(g-n): y...}, (Offset(n), {...f: x...g: y...})::rCtx)
          = {...f: apply(Up(f, Offset(0, n), Down(f, Ef)), x, (f, {...f: x.})::(Offset(0, n), {...f: x...g: y...})::rCtx).} ++n {..(g-n): apply(Up(g-n, Offset(n), Down(g, Eg)), y, (g-n, {..(g-n): y...})::(Offset(n), {...f: x...g: y...})::rCtx)...}
          = {...f: apply(Down(f, Up(f, Offset(0, n), Down(f, Ef))), {...f: x.}, (Offset(0, n), {...f: x...g: y...})::rCtx).} ++n {..(g-n): apply(Down(g-n, Up(g-n, Offset(n), Down(g, Eg))), {..(g-n): y...}, (Offset(n), {...f: x...g: y...})::rCtx)...}
          = {...f: apply(Down(Offset(0, n), Up(Offset(0, n), Down(f, Ef))), {...f: x...g: y...}, rCtx).} ++n {..(g-n): apply(Down(Offset(n), Up(Offset(n), Down(g, Eg))), {...f: x...g: y...}, rCtx)
          = {...f: apply(Up(f, Down(Offset(0, n), Up(Offset(0, n), Down(f, Ef)))), x, (f, {...f: x...g: y...})::rCtx).} ++n {..(g-n): apply(Up(g, Down(Offset(n), Up(Offset(n), Down(g, Eg)))), y, (g, {...f: x...g: y...})::rCtx)
          = {...f: apply(Ef, x, (f, {...f: x...g: y...})::rCtx).} ++n {..(g-n): apply(Eg, y, (g, {...f: x...g: y...})::rCtx)
          = {...f: apply(Ef, x, (f, {...f: x...g: y...})::rCtx)...g: apply(Eg, y, (g, {...f: x...g: y...})::rCtx)
          = apply(Reuse({f: Ef, g: Eg}), {...f: x...g: y...}, rCtx)
          = apply(editAction, r, rCtx)
          QED.
          
          Proof if using mapUpHere (which is nice because it does not prepend unnecessary Ups and Downs)
          
          Proof: (f < n, g >= n)
          editAction: Reuse({f: Ef, g: Eg})
          left: Down(Offset(0, n), Reuse({f: mapUpHere(Ef, Offset(0, n), Up(f)) }))
          right: Down(Offset(n), Reuse({(g-n): mapUpHere(Eg, Offset(n), Up(f))}))
          r = {...f: x...g: y...}
          
          apply(left, r, rCtx) ++n apply(right, r, rCtx))
          = apply(Down(Offset(0, n), Reuse({f: mapUpHere(Ef, Offset(0, n), Up(f)) })), r, rCtx) ++n
            apply(Down(Offset(n), Reuse({(g-n): mapUpHere(Eg, Offset(n), Up(f))})), r, rCtx))
          = apply(Reuse({f: mapUpHere(Ef, Offset(0, n), Up(f)) }), r[0,n], (Offset(0, n), r)::rCtx) ++n
            apply(Reuse({(g-n): mapUpHere(Eg, Offset(n), Up(f))}), r[n...], (Offset(n), r)::rCtx))
          = r[0,n][f -> 
              apply(mapUpHere(Ef, Offset(0, n), Up(f)), r[f], (f, r[0,n])::(Offset(0, n), r)::rCtx)] ++n
            r[n...][g-n ->
              apply(mapUpHere(Eg, Offset(n), Up(f)),
                r[n+(g-n)], (g-n, r[n...])::(Offset(n), r)::rCtx)
            ]
          = r[f ->
                apply(Ef, r[f], (f, r)::rCtx)
              g ->
                apply(Ef, r[g], (g, r)::rCtx)]
          = apply(Reuse({f: Ef, g: Eg}), r, rCtx)
          = apply(editAction, r, rCtx);
          QED;
        */
        
        var left = {};
        var right = {};
        forEachChild(editAction, (child, k) => {
          let reuseChild = Up(k, child);
          let f = k, g = k;
          if(f < count) {
            // I could also have done a mapUpHere there. What is the best?
            //left[f] = Up(f, Offset(0, count), Down(f, editAction.childEditActions[k]));
            left[k] = Down(k, mapUpHere(reuseChild, Offset(0, count), Up(k))); 
          } else { // g >= count
            //right[g - count] = Up(g-count, Offset(count), Down(g, editAction.childEditActions[k]));
            right[g-count] = Down(g-count, mapUpHere(reuseChild, Offset(count), Up(k)));
          }
        })
        // left: Down(Offset(0, n), Reuse({f: Up(f, Offset(0, n), Down(f, Ef))}))
        // right: Down(Offset(n), Reuse({(g-n): Up(g-n, Offset(n), Down(g, Eg))}))
       
        return [SameDownAs(isRemove)(Offset(0, count), New(left, editAction.model)),
                SameDownAs(isRemove)(Offset(count), New(right, editAction.model))];
      } else if(typeof editAction.model.value === "string") {
        /** Proof
          editAction = New("abcdnef");
          
          apply(New("abcdn"), r, rCtx) ++n apply(New("ef"), r, rCtx)
          = "abcdn" + "ef"
          = "abcdnef"
          = apply(editAction, r, rCtx)
        */
        return [rawIfPossible(New(editAction.model.value.substring(0, count)), wasRaw), rawIfPossible(New(editAction.model.value.substring(count)), wasRaw)];
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
        
        var left = {};
        var right = {};
        forEachChild(editAction, (child, k) => {
          let f = k, g = f;
          if(f < count) {
            left[f] = child;
          } else {
            right[g - count] = child;
          }
        });
        var treeOps = treeOpsOf(editAction.model.value);
        var leftModelValue = treeOps.init();
        var rightModelValue = treeOps.init();
        forEach(editAction.model.value, (child, k) => {
          let f = k, g = f;
          if(f < count) {
            leftModelValue[f] = child;
          } else {
            rightModelValue[g - count] = child;
          }
        })
        // Proof: editAction = New({fi = ei}i, [])
        //                   = Concat(count, Down(Offset(0, count), New({fi = ei, if fi < count}i)), Down(Offset(count), New({(fi-count) = ei, if fi >= count})))
        return [rawIfPossible(New(left, InsertModel(leftModelValue)), wasRaw), rawIfPossible(New(right, InsertModel(rightModelValue)), wasRaw)];
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
        return [editAction.first, editAction.second];
      } else if(editAction.count > count) {
        /**
          Proof: Assume
          editAction = Concat(p, E1, E2)   where p > n
          [left1, right1] = apply(n, E1) and thus apply(left1, r, rCtx) ++n apply(right1, r, rCtx) = apply(E1, r, rCtx)
          left = left1
          right = Concat(p, right1, E2)
          
          apply(left1, r, rCtx) ++n apply(Concat(p-n, right1, E2), r, rCtx);
          = apply(left1, r, rCtx) ++n (apply(right1, r, rCtx) ++(p-n) apply(E2, r, rCtx))
          = (apply(left1, r, rCtx) ++n apply(right1, r, rCtx)) ++p apply(E2, r, rCtx)
          = apply(E1, r, rCtx) ++p apply(E2, r, rCtx)
          = apply(Concat(p, E1, E2), r, rCtx)
          = apply(editAction, r, rCtx)
        */
        let [left1, right1] = splitAt(count, editAction.first, isRemove);
        return [
          left1,
          Concat(editAction.count - count, right1, editAction.second, undefined, editAction.firstReuse, editAction.secondReuse)
        ];
      } else { // editAction.count < count
        /**
          Proof: Assume
          editAction = Concat(p, E1, E2)   where p < n
          [left2, right2] = apply(n-p, E2) and thus apply(left2, r, rCtx) ++(n-p) apply(right2, r, rCtx) = apply(E2, r, rCtx)
          left = Concat(p, E1, left2)
          right = right2
          
          = apply(left, r, rCtx) ++n apply(right, r, rCtx);
          = apply(Concat(p, E1, left2), r, rCtx) ++n apply(right2, r, rCtx)
          = (apply(E1, r, rCtx) ++p apply(left2, r, rCtx)) ++n apply(right2, r, rCtx)
          = apply(E1, r, rCtx) ++p (apply(left2, r, rCtx) ++(n-p) apply(right2, r, rCtx))
          = apply(E1, r, rCtx) ++p apply(E2, r, rCtx)
          = apply(Concat(p, E1, E2), r, rCtx)
          = apply(editAction, r, rCtx)
        */
        let [left, right] = splitAt(count - editAction.count, editAction.second, isRemove);
        return [
          Concat(editAction.count, editAction.first, left, editAction.replaceCount, // Weird ReplaceAt. Try undefined?
          editAction.firstReuse, editAction.secondReuse),
          right
        ];
      }
    case Type.Up:
      if(isOffset(editAction.keyOrOffset)) {
        /** Proof. Assume
         editAction = Up(Offset(c, n, o), X)
         
         [left1, right1] = splitAt(n, X)
         so apply(left1, r[a-c..a-c+o[, (Offset(a-c, o), r)::ct) ++n apply(right1, r[a-c..a-c+o[, (Offset(a-c, o), r)::ct) == apply(X, r[a-c..a-c+o[, (Offset(a-c, o), r)::ct)
         left = Up(Offset(c, n o), left1)
         right = Up(Offset(c, n, o), right1)
         
         = apply(left, r[a..a+n[, (Offset(a, n), r)::ctx) ++n
           apply(right, r[a..a+n[, (Offset(a, n), r)::ctx) ++n
         = apply(Up(Offset(c, n o), left1), r[a..a+n[, (Offset(a, n), r)::ctx) ++n apply(Up(Offset(c, n, o), right1), r[a..a+n[, (Offset(a, n), r)::ctx)
         = apply(left1, r[a-c..a-c+o[, (Offset(a-c, o), r)::ct) ++n apply(right1, r[a-c..a-c+o[, (Offset(a-c, o), r)::ct)
         = apply(X, r[a-c..a-c+o[, (Offset(a-c, o), r)::ctx)
         = apply(Up(Offset(c, n, o), X), r[a..a+n[, (Offset(a, n), r)::ctx)
         = apply(editAction, r[a..a+n[, (Offset(a, n), r)::ctx)
        */
        
        let o = editAction.keyOrOffset;
        let [left, right] = splitAt(count, editAction.subAction, isRemove);
        return [
          Up(o, left),
          Up(o, right)
        ];
      } else {
        /**
          Proof: Assume
          editAction = Up(f, X)
          [left1, right1] = splitAt(n, X)
          so apply(left1, r, rCtx) ++n apply(right1, r, rCtx) == apply(X, r, rCtx)
          left = Up(f, left1)
          right = Up(f, right1)
          
          apply(left, r[f], (f, r)::rCtx) ++n apply(right, r[f], (f, r)::rCtx)
          = apply(Up(f, left1), r[f], (f, r)::rCtx) ++n apply(Up(f, right1), r[f], (f, r)::rCtx)
          = apply(left1, r, rCtx) ++n apply(right1, r, rCtx)
          = apply(X, r, rCtx)
          = apply(Up(f, X), r[f], (f, r)::rCtx)
          = apply(editAction, r[f], (f, r)::rCtx)
          QED;
        */
        
        let o = editAction.keyOrOffset;
        let [left, right] = splitAt(count, editAction.subAction, isRemove);
        return [
          Up(o, left),
          Up(o,right)];
      }
    case Type.Down:
       if(isOffset(editAction.keyOrOffset)) {
        /** Proof: Identical to Type.Up but in reverse */
        let o = editAction.keyOrOffset;
        let [left, right] = splitAt(count, editAction.subAction, isRemove);
        return [SameDownAs(editAction.isRemove || isRemove)(o, left), SameDownAs(editAction.isRemove || isRemove)(o, right)];
      } else {
        /**
          Proof: Assume
          editAction = Down(f, X)
          [left1, right1] = splitAt(n, X)
          so apply(left1, r[f], (f, r)::rCtx) ++n apply(right1, r[f], (f, r)::rCtx) == apply(X, r[f], (f, r)::rCtx)
          left = Down(f, left1)
          right = Down(f, right1)
          
          apply(left, r, rCtx) ++n apply(right, r, rCtx)
          = apply(Down(f, left1), r, rCtx) ++n apply(Down(f, right1), r, rCtx)
          = apply(left1, r[f], (f, r)::rCtx) ++n apply(right1, r[f], (f, r)::rCtx)
          = apply(X, r[f], (f, r)::rCtx)
          = apply(Down(f, X), r, rCtx)
          = apply(editAction, r, rCtx)
          QED
        */
        
        let o = editAction.keyOrOffset;
        let [left, right] = splitAt(count, editAction.subAction, isRemove);
        return [Down(o, left), Down(o, right)];
      }
    default: {
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
      
      let left = Custom(editAction, {
        apply: x => applyOffset(Offset(0, count), x),
        update: e => ReuseOffset(Offset(0, count), e),
        name: "applyOffset("+keyOrOffsetToString(Offset(0, count)) + ", _)"
        })
      let right = Custom(editAction, {
        apply: x => applyOffset(Offset(count), x),
        update: e => ReuseOffset(Offset(count), e),
        name: "applyOffset("+keyOrOffsetToString(Offset(count)) + ", _)"})
      return [left, right];
      }
    }
    return [];
  }
  editActions.splitAt = splitAt;
  
  /** Proof:
    apply(editAction, r, rCtx)
    = apply(leftFirst, r, rCtx) ++offset.count apply(rightFirst, r, rCtx)
    = apply(leftFirst, r, rCtx) ++offset.count (apply(rightFirst1, r, rCtx) ++offset.newLength ++ apply(rightFirst2, r, rCtx));
  Hence
  
  applyOffset(offset, apply(editAction, r, rCtx))
  = apply(rightFirst1, r, rCtx)
  = apply(offsetAt(offset, editAction), r, rCtx)
  QED
  */
  // apply(offsetAt(offset, EX), r, rCtx)
  // = applyOffset(offset, apply(EX, r, rCtx))
  function offsetAt(newOffset, editAction, isRemove) {
    if(editAction.ctor == Type.Custom) {
      /**Proof:
          apply(offsetAt(f, C), r, rCtx)
        = apply(Custom(C, {apply(x) = applyOffset(f, x)}), r, rCtx)
        = (x => applyOffset(offset, x))(apply(C, r, rCtx))
        = applyOffset(offset, apply(C, r, rCtx))
      */
      // Wrap the edit action with a custom lens.
      return Custom(editAction, {
        apply: function(x) {
          return applyOffset(newOffset, x);
        },
        update: function(editOnOffset) {
          return ReuseOffset(newOffset, editOnOffset);
        },
        name: "applyOffset("+keyOrOffsetToString(newOffset) + ", _)"});
    }
    let [leftFirst, rightFirst] = splitAt(newOffset.count, editAction, isRemove);
    if(editActions.__debug) console.log("splitting")
    if(newOffset.newLength !== undefined) {
      let [rightFirst1, rightFirst2] = splitAt(newOffset.newLength, rightFirst, isRemove);
      return rightFirst1;
    } else {
      return rightFirst;
    }
  }
  editActions.offsetAt = offsetAt;
  
  // Computes the intersection of two offsets.
  function intersectOffsets(offset1, offset2) {
    let newCount = Math.max(offset1.count, offset2.count);
    let end1 = PlusUndefined(offset1.count, offset1.newLength);
    let end2 = PlusUndefined(offset2.count, offset2.newLength);
    let newEnd = MaxUndefined(MinUndefined(end1, end2), 0);
    let newLength = MaxUndefined(MinusUndefined(newEnd, newCount), 0);
    return Offset(newCount, newLength, offset1.oldLength);
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
    return function(E1, E2) {
      let res = fun(E1, E2);
      if(editActions.__debug) {
        console.log("  merge returns");
        console.log(addPadding("  " + stringOf(E1), "  "));
        console.log(addPadding("  " + stringOf(E2), "  "));
        console.log(addPadding("  =>" + stringOf(res), "  =>"));
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
  
  
  // Soft specification:
  // if applyZ(E1, rrCtx) and applyZ(E2, rrCtx) is defined
  // then applyZ(merge(E1, E2), rrCtx) is defined.
  var merge = addLogMerge(function mergeRaw(E1, E2) {
    if(editActions.__debug) {
      console.log("merge");
      editActions.debug(E1);
      editActions.debug(E2);
      if(isReplace(E2) && stringOf(E2).startsWith("Concat")) console.trace("Weird concat");
    }
    let E1IsRaw = false;
    let E2IsRaw = false;
    if(typeof E1 !== "object") { E1IsRaw = true; E1 = New(E1); }
    if(typeof E2 !== "object") { E2IsRaw = true; E2 = New(E2); }
    if(E1.ctor == Type.Choose) {
      /** Proof:
          applyZ(merge(E1, E2), rrCtx)
        = apply(Choose(map(E1.subActions, x => merge(x, E2))), rrCtx)
        = apply(map(E1.subActions, x => merge(x, E2))[0], rrCtx)
        = apply(merge(E1.subActions[0], E2), rrCtx)
        Now, since applyZ(E1, rrCtx) = applyZ(E1.subActions[0],rrCtx) is defined,
        by induction, we obtain the result. QED;
      */
      return Choose(...Collection.map(E1.subActions, x => merge(x, E2)));
    }
    if(E2.ctor == Type.Choose) {
      /** Proof: Same as above. */
      return Choose(...Collection.map(E2.subActions, x => merge(E1, x)));
    }
    let result = [];
    merge_cases: {
      if(isIdentity(E1)) {
        /** Proof: applyZ(merge(E1, E2), rrCtx) = apply(E2, rrCtx) */
        result.push(E2);
        break merge_cases;
      }
      if(isIdentity(E2)) {
        /** Proof: applyZ(merge(E1, E2), rrCtx) = apply(E1, rrCtx) */
        result.push(E1);
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
      let E1IsInsert = isNew(E1) && E1.model.ctor == TypeNewModel.Insert;
      let E2IsInsert = isNew(E2) && E2.model.ctor == TypeNewModel.Insert;
      let E1IsReusingBelow = false;
      if(E1IsInsert) {
        forEach(E1.model.value, (child, k) => {
          if(child) E1IsReusingBelow = true;
        });
        if(E1IsReusingBelow) {
          /** Proof:
              applyZ(merge(E1, E2), rrCtx)
            = applyZ(merge(New({k: ck}_k), E2), rrCtx)
            = applyZ(New({k: merge(ck, E2) | ck}_k), rrCtx)
            = New{k: applyZ(merge(ck, E2) | ck, rrCtx)}_k
            Since applyZ(E1, rrCtx) was defined, applyZ(ck, rrCtx) was defined. By induction, we conclude.
            QED;
          */
          result.push(New(mapChildren(E1.childEditActions, (k, c) => access(E1.model.value, k) ? merge(c, E2) : c), E1.model));
        }
      }
      let E2IsReusingBelow = false;
      if(E2IsInsert) {
        forEach(E2.model.value, (child, k) => {
          if(child) E2IsReusingBelow = true;
        });
        if(E2IsReusingBelow) {
          /** Proof: Same as above*/
          result.push(New(mapChildren(E2.childEditActions, (k, c) => access(E2.model.value, k) ? merge(E1, c) : c), E2.model));
        }
      }
      if(!E1IsReusingBelow && !E2IsReusingBelow) {
        if(E1IsInsert) {
          /** Proof: Trivial */
          result.push(E1);
        }
        if(E2IsInsert) {
          /** Proof: Trivial */
          result.push(E2);
        }
        if(E1IsInsert || E2IsInsert) {
          /** Proof that result is not empty:
              if E1IsInsert, then result contains E1. If E2IsInsert, then result contains E2. QED */
          break merge_cases;
        }
      }
      
      let E1IsContactNotReplace = E1.ctor == Type.Concat && !isReplace(E1);
      let E2IsContactNotReplace = E2.ctor == Type.Concat && !isReplace(E2);
      if(E1IsContactNotReplace && E2IsContactNotReplace) {
        if(!E1.firstReuse && !E1.secondReuse && !E2.firstReuse && !E2.secondReuse) {
          result.push(E1);
          result.push(E2);
          break merge_cases;
        }
      }
      // A regular Concat is like a New.
      // We only merge children that have reuse in them. The other ones, we don't merge.
      let E1IsConcatReuse = E1IsContactNotReplace && (E1.firstReuse || E1.secondReuse);
      let E2IsConcatReuse = E2IsContactNotReplace && (E2.firstReuse || E2.secondReuse);
      let E1IsPrepend = E1IsConcatReuse && isPrepend(E1);
      let E2IsPrepend = E2IsConcatReuse && isPrepend(E2);
      let E1IsAppend = E1IsConcatReuse && isAppend(E1);
      let E2IsAppend = E2IsConcatReuse && isAppend(E2);
      if(E1IsAppend && E2IsAppend) {
        let newRemaining = merge(E1.first, E2.first);
        // There might be only one solution is the prepended thing is the same.
        if(isNew(E1.second) && isNew(E2.second)) {
          let v1 = valueIfNew(E1.second);
          let v2 = valueIfNew(E2.second);
          if(typeof v1 == "string" && v1 + v2 == v2 + v1) {
            result.push(Append(MinUndefined(E1.count, E2.count), newRemaining, v1 + v2));
            break merge_cases;
          } else if(typeof v1 == "string") {
            result.push(Append(MinUndefined(E1.count, E2.count), newRemaining, Choose(v1 + v2, v2 + v1), newRemaining));
            break merge_cases;
          }
        }
      }
      if(E1IsPrepend && E2IsPrepend) {
        let newRemaining = merge(E1.second, E2.second);
        // There might be only one solution is the prepended thing is the same.
        if(isNew(E1.first) && isNew(E2.first)) {
          let v1 = valueIfNew(E1.first);
          let v2 = valueIfNew(E2.first);
          if(typeof v1 == "string" && v1 + v2 == v2 + v1) {
            result.push(Prepend(v1.length + v2.length, v1 + v2, newRemaining));
            break merge_cases;
          } else if(typeof v1 == "string") {
            result.push(Prepend(v1.length + v2.length, Choose(v1 + v2, v2 + v1), newRemaining));
            break merge_cases;
          }
        }
      }
      // Particular case for two Prepend and two Append so that we don't compute them.
      if(E1IsConcatReuse) {
        let newLeft = E1.firstReuse ? merge(E1.first, E2) : E1.first;
        let newLeftLength = outLength(newLeft);
        if(newLeftLength === undefined) newLeftLength = E1.count;
        result.push(
          Concat(newLeftLength, newLeft,
                 E1.secondReuse ? merge(E1.second, E2) : E1.second, undefined, E1.firstReuse, E1.secondReuse));
      }
      if(E2IsConcatReuse) {
        let newLeft = E2.firstReuse ? merge(E1, E2.first) : E2.first;
        let newLeftLength = outLength(newLeft);
        if(newLeftLength === undefined) newLeftLength = E2.count;
        result.push(
          Concat(newLeftLength, newLeft,
                 E2.secondReuse ? merge(E1, E2.second) : E2.second, undefined, E2.firstReuse, E2.secondReuse));
      }
      if(!E1IsConcatReuse && !E2IsConcatReuse) {
        if(E1IsContactNotReplace) {
          result.push(E1);
        }
        if(E2IsContactNotReplace) {
          result.push(E2);
        }
        if(E1IsContactNotReplace || E2IsContactNotReplace) {
          break merge_cases;
        }
      }
      // If nothing was added, it means that:
      
      // We will deal with RemoveExcept later. Let's deal with regular Down
      // For now, it looks like
      let E1IsPureDown = isDown(E1) && !isRemoveExcept(E1);
      let E2IsPureDown = isDown(E2) && !isRemoveExcept(E2);
      if(E1IsPureDown && E2IsPureDown && keyOrOffsetAreEqual(E1.keyOrOffset, E2.keyOrOffset)) {
        result.push(Down(E1.keyOrOffset, merge(E1.subAction, E2.subAction)));
      } else {
        // Not the same keys or offsets.
        if(E1IsPureDown) {
          // Let's see if we can apply the key or offset to E2.
          let E2changed = keyOrOffsetIn(E1.keyOrOffset, E2);
          result.push(Down(E1.keyOrOffset, merge(E1.subAction, E2changed)));
        }
        if(E2IsPureDown) {
          // Let's see if we can apply the key or offset to E2.
          let E1changed = keyOrOffsetIn(E2.keyOrOffset, E1);
          result.push(Down(E2.keyOrOffset, merge(E1changed, E2.subAction)));
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
        result.push(Up(E1.keyOrOffset, merge(E1.subAction, E2.subAction)));
      } else { // If they are both Up and not equal, it means they are different offsets.
        if(E1IsUp) {
          result.push(E1);
        }
        if(E2IsUp) {
          result.push(E2);
        }
      }
      if(E1IsUp ||
         E2IsUp) {
        break merge_cases;   
      }
      
      // No more New, Concat, Down or Up
      // Only Reuse, Replace, and RemoveExcept now.
      
      // We start by all Reuse pairs:
      // Reuse / Reuse
      if(isReuse(E1) && isReuse(E2)) {
        // Merge key by key.
        let o = mapChildren(E1.childEditActions, (k, c) => {
          if(k in E2.childEditActions) {
            return merge(c, E2.childEditActions[k]);
          } else {
            return c;
          }
        }, /*canReuse*/false);
        for(let k in E2.childEditActions) {
          if(!(k in E1.childEditActions)) {
            o[k] = E2.childEditActions[k];
          }
        }
        result.push(New(o, ReuseModel(E1.model.create || E2.model.create)));
      // (E1, E2) is [R*, F, C, U, D, UR] x [R*, F, C, U, D, UR] \ R* x R*
      } else if(isReuse(E1) && isReplace(E2)) {
        let [inCount, outCount, left, right] = argumentsIfReplace(E2);
        let [o1, l1, r1] = splitIn(inCount, E1);
        let newFirst = merge(l1, left);
        let newSecond = merge(r1, right);
        let newCount = outLength(newFirst);
        if(newCount === undefined) newCount = outCount;
        result.push(Replace(inCount, outCount, newFirst, newSecond));
      } else if(isReuse(E2) && isReplace(E1)) {
        let [inCount, outCount, left, right] = argumentsIfReplace(E1);
        let [o2, l2, r2] = splitIn(inCount, E2);
        let newFirst = merge(left, l2);
        let newSecond = merge(right, r2);
        let newCount = outLength(newFirst);
        if(newCount === undefined) newCount = outCount;
        result.push(Replace(inCount, outCount, newFirst, newSecond));
      } else if(isReuse(E1) && isRemoveExcept(E2)) {
        // E1 being a Reuse, offsetIn is always defined.
        let restricted = offsetIn(E2.keyOrOffset, E1);
        result.push(RemoveExcept(E2.keyOrOffset, merge(restricted, E2.subAction)));
      } else if(isReuse(E2) && isRemoveExcept(E1)) {
        let restricted = offsetIn(E1.keyOrOffset, E2);
        // E2 being a Reuse, offsetIn is always defined.
        result.push(RemoveExcept(E1.keyOrOffset, merge(E1.subAction, restricted)));
        // No more Reuse now.
      } else if(isRemoveExcept(E1) && isRemoveExcept(E2)) {
        let commonOffset = intersectOffsets(E1.keyOrOffset, E2.keyOrOffset);
        printDebug("commonOffset", keyOrOffsetToString(commonOffset));
        // We change the input. So we use offsetIn.
        result.push(RemoveExcept(commonOffset, merge(offsetIn(commonOffset, E1), offsetIn(commonOffset, E2))));;
      } else if(isRemoveExcept(E1) && isReplace(E2)) {
        result.push(RemoveExcept(E1.keyOrOffset, merge(E1.subAction, offsetIn(E1.keyOrOffset, E2))));
      } else if(isReplace(E1) && isRemoveExcept(E2)) {
        result.push(RemoveExcept(E2.keyOrOffset, merge(offsetIn(E2.keyOrOffset, E1), E2.subAction)));
      } else if(isReplace(E1) && isReplace(E2)) {
        printDebug("Two replaces");
        let [inCount1, outCount1, left1, right1] = argumentsIfReplace(E1);
        let [inCount2, outCount2, left2, right2] = argumentsIfReplace(E2);
        if(inCount1 == 0) { // First is an prepend
          result.push(Prepend(outCount1, left1, merge(right1, E2)));
        }
        if(inCount2 == 0) { // Second is an prepend
          result.push(Prepend(outCount2, left2, merge(E1, right2)));
        }
        if(inCount1 == 0 || inCount2 == 0) { // done prepending
          break merge_cases;
        }
        if(outCount1 == 0 && outCount2 == 0) {
          // Two replacements with empty content. We replace them by Remove?
          let minRemove = Math.min(inCount1, inCount2);
          result.push(Remove(minRemove, merge(
            inCount1 == minRemove ? right1 : Remove(inCount1 - minRemove, right1),
            inCount2 == minRemove ? right2 : Remove(inCount2 - minRemove, right2)
          )));
        // We are left with non-Prepends which are not both deletions.
        } else if(inCount1 == inCount2) { // Aligned replaces
          let newLeft = merge(left1, left2);
          let newLeftCount = MinUndefined(outLength(newLeft, inCount1), outCount1 + outCount2);
          result.push(Replace(inCount1, newLeftCount, newLeft, merge(right1, right2)));
        } else if(inCount1 < inCount2) {
          let [o2, l2, r2] = splitIn(inCount1, E2); // We split the bigger left if possible.
          if(r2 !== undefined) {
            let newLeft = merge(left1, l2);
            let newRight = merge(right1, r2);
            let newLeftCount = MinUndefined(outLength(newLeft, inCount1), outCount1 + outCount2);
            result.push(Replace(inCount1, newLeftCount, newLeft, newRight));
          } else {
            // We were not able to split E2 at the given count.
            // Let's convert it 
            // We split the right if possible
            let [o1, l1, r1] = splitIn(inCount2, E1);
            if(r1 !== undefined) {
              let newLeft = merge(l1, left2);
              let newRight = merge(r1, right2);
              let newLeftCount = MinUndefined(outLength(newLeft, inCount2), outCount1 + outCount2);
              result.push(Replace(inCount2, newLeftCount, newLeft, newRight));
            } else {
              result.push(merge(E1, toSplitInCompatibleAt(E2, inCount1)));
              //result.push(merge(toSplitInCompatibleAt(E1, inCount2), E2));
            }
          }
        } else { // inCount1 > inCount2
          // [  inCount1   |   ] [.....]
          // [  inCount2   ][     .... ]
          let [o1, l1, r1] = splitIn(inCount2, E1);
          if(r1 !== undefined) {
            let newLeft = merge(l1, left2);
            let newRight = merge(r1, right2);
            let newLeftCount = outLength(newLeft, inCount2);
            printDebug("newLeftCount", newLeftCount);
            newLeftCount = MinUndefined(newLeftCount, outCount1 + outCount2);
            result.push(Replace(inCount2, newLeftCount, newLeft, newRight));
          } else {
            let [o2, l2, r2] = splitIn(inCount1, E2); // We split the bigger left first if possible.
            if(r2 !== undefined) {
              let newLeft = merge(left1, l2);
              let newRight = merge(right1, r2);
              let newLeftCount = MinUndefined(outLength(newLeft, inCount1), outCount1 + outCount2);
              result.push(Replace(inCount1, newLeftCount, newLeft, newRight));
            } else {
              result.push(merge(toSplitInCompatibleAt(E1, inCount2), E2));
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
  function ReuseUp(initUp, action) {
    let finalUp = initUp;
    while(!isIdentity(finalUp)) {
      printDebug("ReuseUp", initUp, action);
      // only here we can combine key and offset into a single key.
      if(finalUp.subAction && isOffset(finalUp.subAction.keyOrOffset) && !isOffset(finalUp.keyOrOffset)) {
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
      action = ReuseKeyOrOffset(finalUp.keyOrOffset, action);
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
  
  /* Returns [e', subs] where
     e' is an edit built from U suitable to apply on the given context.
     subs are the sub back-propagation problems to solve and merge to the final result
  
  */
  /** Specification:
    Assuming apply(E, r, rCtx) is defined,
    Assuming apply(U, apply(E, r, rCtx), apply(ECtx, r, rCtx)) is defined,
    
    partitionEdit returns a triplet [E', sub, ECtx']
    such that:
    apply(prefixReuse(ECtx', E'), firstRecord(r, rCtx)) is correctly defined.
    
    and sub are well-defined backPropagate problems.
  */
  function partitionEdit(E, U, ECtx) {
    if(editActions.__debug) {
      console.log("partitionEdit");
      console.log("  "+addPadding(stringOf(E), "  "));
      console.log("<="+addPadding(stringOf(U), "  "));
      console.log("-|"+addPadding(stringOf(ECtx), "  "));
    }
    let wasRaw = false;
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
        let [solution, next, ECtxInit2] = partitionEdit(E, U, newECtx)
        if(ECtx.ctor == Type.Up) {
          return [Up(ECtx.keyOrOffset, solution), next, ECtx];
        }
        if(ECtx.ctor == Type.Down) {
          return [Down(ECtx.keyOrOffset, solution), next, ECtx];
        }
      }
      let [E1p, E1Ctxp, newSecondUpOffset] = walkUpActionCtx(U.keyOrOffset, E, ECtx);
      return partitionEdit(E1p, newSecondUpOffset ? Up(newSecondUpOffset, U.subAction) : U.subAction, E1Ctxp);
    }
    if(U.ctor == Type.Down) {
      let [E1p, E1Ctxp] = walkDownActionCtx(U.keyOrOffset, E, ECtx);
      if(editActions.__debug) {
        console.log("After walking down " + keyOrOffsetToString(U.keyOrOffset) + ", we get "+stringOf(E1p));
        console.log("E1Ctxp: "+stringOf(E1Ctxp));
      }
      return partitionEdit(E1p,  U.subAction,  E1Ctxp);
    }
    if(isReuse(U) && !U.model.create) {
      let buildPart = buildingPartOf(E);
      if(editActions.__debug) {
        console.log("Recovered a build part: " + stringOf(buildPart));
      }
      return [buildPart, [[E, U, ECtx]], ECtx];
    }
    if(U.ctor == Type.New) {
      let o = {};
      let next = [];
      for(let k in U.childEditActions) {
        if(editActions.__debug) {
          console.log("Pre-pending New({..."+k+": | })");
        }
        let [subK, nexts] = partitionEdit(E, U.childEditActions[k], ECtx);
        o[k] = subK;
        next.push(...nexts);
      }
      return [rawIfPossible(New(o, U.model), wasRaw), next, ECtx];
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
      let [F2, next2] = partitionEdit(E, U.second, ECtx);
      if(U.count == 0) { // We don't bother about building first element.
        return [F2, next2, ECtx];
      }
      if(editActions.__debug) {
        console.log("Inside Concat("+U.count+", | , [done])");
      }
      let [F1, next1] = partitionEdit(E, U.first, ECtx);
      
      return [Concat(U.count, F1, F2, U.forkAt, U.firstReuse, U.secondReuse), next1.concat(next2), ECtx];
    }
    throw "Case not supported in partitionEdit: " + stringOf(U);
  }

  // Returns the building part that starts an edit action (the Up, Down, New, Concat)
  // 
  function buildingPartOf(E) {
    if(E.ctor == Type.Up) {
      let buildingPart = buildingPartOf(E.subAction);
      return Up(E.keyOrOffset, buildingPart);
    }
    if(E.ctor == Type.Down) {
      let buildingPart = buildingPartOf(E.subAction);
      return Down(E.keyOrOffset, buildingPart);
    }
    if(E.ctor == Type.New) {
      if(isReuse(E) && !E.model.create) {
        return Reuse();
      }
      let o = {};
      for(let k in E.childEditActions) {
        o[k] = buildingPartOf(E.childEditActions[k]);
      }
      return New(o, E.model);
    }
    if(E.ctor == Type.Concat) {
      let left = buildingPartOf(E.first);
      let right = buildingPartOf(E.second);
      return Concat(E.count, left, right, E.replaceCount);
    }
    return E;
  }
  
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
  function prefixReuse(ctx, editAction) {
    // First, build a path out of all the relative paths
    // Then, apply this path
    return ReuseUp(pathAt(ctx), editAction);;
  }
  
  /** Specifications:
    Assuming apply(E, r, rCtx) is defined, and
    apply(U, apply(E, r, rCtx), apply(ECtx, r, rCtx)) is defined
    
    then apply(backPropagate(E, U, ECtx), firstRecord(r, rCtx)) is defined,
    
    where
    
    firstRecord(r, []) = r
    firstRecord(_, (k, r)::ctx) = firstRecord(r, ctx);
  */
  function backPropagate(E, U, ECtx = undefined) {
    let wasRaw = false, Uraw = U;
    if(!isEditAction(U)) {
      U = New(U);
      wasRaw = true;
    }
    if(!isEditAction(E)) {
      E = New(E);
    }
    if(editActions.__debug) {
      console.log("backPropagate");
      console.log("  "+addPadding(stringOf(E), "  "));
      console.log("<="+addPadding(stringOf(U), "  "));
      console.log("-|"+addPadding(stringOf(ECtx), "  "));
    }
    // We remove downs and ups to make them part of the context.
    if(E.ctor == Type.Down) {
      /** Proof:
        Since we assume apply(Down(ko, subAction), r, rCtx) is defined, it implies that
        apply(subAction, r[ko], (ko, r)::rCtx) is defined
        
        Since we assume that apply(U, apply(Down(ko, subAction, r, rCtx)), apply(ECtx, r, rCtx)) is defined, it is equal to:
        = apply(U, apply(subAction, r[ko], (ko, r)::rCtx), apply(Up(ko, ECtx), r[ko], (ko, r)::Ctx))
        is defined.
        Thus, by induction,
        
        apply(backPropagate(subAction, U, Up(ko, ECtx)), firstRecord(r[ko], (ko, r)::rCtx)) is defined
        = apply(backPropagate(subAction, U, Up(ko, ECtx)), firstRecord(r, rCtx))
        = apply(backPropagate(E, U, ECtx), firstRecord(r, rCtx))
        QED;
      */
      return backPropagate(E.subAction, Uraw, Up(E.keyOrOffset, ECtx));
    }
    if(E.ctor == Type.Up) {
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
      return backPropagate(E.subAction, Uraw, Down(E.keyOrOffset, ECtx))
    }
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
      return Choose(...Collection.map(U.subActions, childU => backPropagate(E, childU, ECtx)));
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
        return backPropagate(E.subAction, newU, ECtx);
      } else {
        return E.lens.backPropagate(backPropagate, Uraw, E.lens.cachedInput, E.lens.cachedOutput, E.subAction, ECtx);
      }
    }
    if(U.ctor == Type.Choose) {
      /** Proof: same as above for the Choose case */
      return Choose(...Collection.map(U.subActions, childU => backPropagate(E, childU, ECtx)));
    }
    if(isReuse(U)) {
      let result = Reuse();
      forEachChild(U, (child, k) => {
        let [Ep, ECtxp] = walkDownActionCtx(k, E, ECtx);
        let tmp = backPropagate(Ep, Up(k, child), ECtxp);
        result = merge(result, tmp);
      });
      /** Proof:
          Assume apply(E, r, rCtx) is defined hence, apply(E, r, rCtx)[f] is defined for every f,
          and apply(downAt(f, E), r, rCtx) is defined for every f.
          Assume apply(U, apply(E, r, rCtx), apply(ECtx, r, rCtx)) is defined
          The latest is equal to:
          apply(Reuse({f: Uf}_f), apply(E, r, rCtx), apply(ECtx, r, rCtx))
          = {f: applyZ(Uf, apply(E, r, rCtx)[f], (f, apply(E, r, rCtx))::apply(ECtx, r, rCtx))}_f
          = {f: applyZ(Uf, apply(downAt(f, E), r, rCtx), apply((f, E)::ECtx, r, rCtx))}_f
          Hence all these applyZ are defined, and thus
          
          backPropagate(downAt(f, E), Uf, (f, E)::ECtx) is defined.
          Thus the merge of all of them is defined and thus
          backPropagate(E, U, ECtx) is defined.
          QED;
      */
      return result;
    }
    /** Specification: all [E, U, ECtx] satisfy backPropagate requirements.
        Specification: apply(solution, r, rCtx) is valid*/
    let solution = Reuse(), subProblems = [];
    if(isRemoveExcept(U)) {
      printDebug("removeExcept case")
      let {count, newLength, oldLength} = U.keyOrOffset;
      // Base case where we remove everything from the array, possibly prepending something else at the given offset.
      if(newLength === 0) {
        if(E.ctor == Type.Concat) {
          let [ELeft, ECtxLeft] = walkDownActionCtx(Offset(0, E.count), E, ECtx);
          let [ERight, ECtxRight]= walkDownActionCtx(Offset(E.count), E, ECtx);
          solution = Reuse();
          /** Proof:
              Assume apply(E@Concat(n, ELeft, ERight), r, rCtx) is defined
              Assume apply(U@RemoveExcept(Offset(0, 0), subU), apply(E, r, rCtx), apply(ECtx, r, rCtx)) is defined
              = apply(U@RemoveExcept(Offset(0, 0), subU), apply(ELeft, r, rCtx) ++n apply(ERight, r, rCtx), apply(ECtx, r, rCtx)) is defined
              
              
              
          */
          subProblems.push([ELeft, U, ECtxLeft]);
          subProblems.push([ERight, U, ECtxRight]);
        } else {
          printDebug("Solving sub-problem first", U)
          let [EEmpty, ECtxEmpty] = walkDownActionCtx(U.keyOrOffset, E, ECtx);
          subProblems.push([EEmpty, U.subAction, ECtxEmpty]);
          if(isReuse(E)) {
            printDebug("we prefix with a Reuse the RemoveAll");
            solution = prefixReuse(ECtx, RemoveAll(Reuse(), oldLength));
          }
        }
      } else {
        printDebug("Walking down the context by ", U.keyOrOffset);
        let [EMiddle, ECtxMiddle] = walkDownActionCtx(U.keyOrOffset, E, ECtx);
        subProblems.push([EMiddle, U.subAction, ECtxMiddle]);
        // We start by taking the change made below.
        let finalResult = backPropagate(EMiddle, U.subAction, ECtxMiddle);
        // If we removed the left part, we try to find what we removed.
        if(count > 0) {
          let [ELeft, ECtxLeft] = walkDownActionCtx(Offset(0, count), E, ECtx);
          subProblems.push([ELeft, RemoveAll(Reuse(), count), ECtxLeft]);
        }
        // If we removed the right part, we try to find what we removed.
        // Careful, if count + newLength == 0
        if(newLength !== undefined && LessThanUndefined(count + newLength, oldLength) && count + newLength > 0) {
          let [ERight, ECtxRight] = walkDownActionCtx(Offset(count + newLength), E, ECtx);
          subProblems.push([ERight, RemoveAll(Reuse(), MinusUndefined(oldLength, count + newLength)), ECtxRight]);
        }
      }
    } else if(isPrepend(U)) {
      let [s, probs, newECtx] = partitionEdit(E, U.first, ECtx);
      // Now we prefix action with the Reuse and ReuseOffset from the context and call it a solution.
      solution = prefixReuse(newECtx, Prepend(U.count, s));
      subProblems.push([E, U.second, ECtx], ...probs);
    } else if(isAppend(U)) {
      let [s, probs, newECtx] = partitionEdit(E, U.second, ECtx);
      solution = prefixReuse(newECtx, Append(U.count, s));
      subProblems.push([E, U.first, ECtx], ...probs);
      // Now we prefix action with the Reuse and ReuseOffset from the context and call it a solution.
    } else if(isReplace(U)) {
      let [inCount, outCount, left, right] = argumentsIfReplace(U);
      let [inCountE, outCountE, leftE, rightE] = argumentsIfReplace(E);
      if(rightE !== undefined && outCountE == 0) {
        // Whatever the replace of the user, it does not touch the left portion.
        subProblems.push([E.second, U, ECtx]);
      } else {
        let [ELeft, ECtxLeft] = walkDownActionCtx(Offset(0, inCount), E, ECtx);
        subProblems.push([ELeft, left, ECtxLeft]);
        let [ERight, ECtxRight] = walkDownActionCtx(Offset(inCount), E, ECtx);
        subProblems.push([ERight, right, ECtxRight]);
      }
    } else {
    // At this point, we have New, Up, Down, and Concats.
      [s, probs, newECtx] = partitionEdit(E, Uraw, ECtx);
      solution = prefixReuse(newECtx, s);
      subProblems = probs;
    }
    // Now we prefix action with the Reuse and ReuseOffset from the context and call it a solution.
    if(editActions.__debug && !isIdentity(solution)) {
      console.log("intermediate solution:\n"+stringOf(solution));
    }
    printDebug("subProblems:", subProblems);
    for(let [E, U, ECtx] of subProblems) {
      solution = merge(solution, backPropagate(E, U, ECtx));
    }
    return solution;
  }
  editActions.backPropagate = backPropagate;
  
  // Computes the output length that a children of ChildEditActions would produce on original data
  function lengthOfArray(childEditActions) {
    var i = 0;
    var length = 0;
    forEach(childEditActions, (c, k) => {
      length = Math.max(length, k + 1);
    })
    return length;
  }
  
  // Computes the length that a given edit action would produce when it is applied on something of length inCount
  function outLength(editAction, inCount) {
    if(Array.isArray(editAction) || typeof editAction === "string") {
      return editAction.length;
    }
    if(typeof editAction !== "object") {
      return undefined;
    }
    if(!isEditAction(editAction)) {
      editAction = New(editAction);
    }
    if(editActions.__debug) console.log("outLength", stringOf(editAction), "("+inCount+")");
    if(editAction.ctor == Type.Choose) {
      return Collection.firstOrDefaultCallback(editAction.subActions, f => outLength(f, inCount));
    }
    if(typeof editAction.cachedOutLength == "number") {
      return editAction.cachedOutLength;
    }
    if(editAction.ctor == Type.Concat) {
      let rightLength = outLength(editAction.second, editAction.replaceCount === undefined ? inCount : MinusUndefined(inCount, editAction.replaceCount));
      return PlusUndefined(editAction.count, rightLength);
    }
    if(editAction.ctor == Type.New) {
      if(isReuse(editAction)) {
        if(editActions.__debug) console.log("inCount", inCount);
        let l = inCount || 0;
        let hadSome = false;
        for(let k in editAction.childEditActions) {
          if(Number(k) > l) l = Number(k);
          hadSome = true;
        }
        let result = hadSome ? l : typeof inCount != "undefined" ? l : undefined;
        if(editActions.__debug) console.log("Results in ", result);
        return result;
      } else {
        if(typeof editAction.model.value === "string") {
          return editAction.model.length;
        } else {
          return lengthOfArray(editAction.childEditActions);
        }
      }
    }
    if(editAction.ctor == Type.Custom) {
      if(editAction.lens.cachedOutput === undefined) return undefined;
      let m = monoidOf(editAction.lens.cachedOutput);
      return m.length(editAction.lens.cachedOutput);
    }
    if(editAction.ctor == Type.Up) {
      let newLength = isOffset(editAction.keyOrOffset) ? editAction.keyOrOffset.oldLength : undefined;
      return outLength(editAction.subAction, newLength);
    }
    if(editAction.ctor == Type.Down) {
      let newLength = isOffset(editAction.keyOrOffset) ? MinUndefined(editAction.keyOrOffset.newLength, MinusUndefined(inCount, editAction.keyOrOffset.count)) : undefined;
      return outLength(editAction.subAction, newLength);
    }
    console.trace("outLength invoked on unexpected input", editAction);
    return undefined;
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
 
  function isSimpleChildClone(editAction) {
    return editAction.ctor == Type.Down && isIdentity(editAction.subAction) && !isOffset(editAction.keyOrOffset);
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
              diffs.push(eaStrDiff(oldVal, newVal));
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

  strDiff.INSERT = DIFF_INSERT;
  strDiff.DELETE = DIFF_DELETE;
  strDiff.EQUAL = DIFF_EQUAL;
  
  /** Let's assume: apply(eaStrDiff(text1, text2), text1, ctx) = text2 */
  function eaStrDiff(text1, text2) {
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
              acc = Remove(f[1].length, Prepend(s[1].length, New(s[1]), acc));
              index -= 2;
              break;
            }
          }
          acc = Prepend(s[1].length, New(s[1]), acc);
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
    return editAction.model.ctor === TypeNewModel.Reuse ? prog : editAction.model.value;
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
      update(x, k, v) { x[k] = v; },
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
    return typeof editAction == "object" && editAction.ctor == Type.New && editAction.model.ctor === TypeNewModel.Reuse;
  }
  function isNew(editAction) {
    return isObject(editAction) && editAction.ctor == Type.New && editAction.model.ctor == TypeNewModel.Insert || !isEditAction(editAction);
  }
  function valueIfNew(editAction) {
    return isEditAction(editAction) ? editAction.model.value : editAction;
  }
  function isInsert(editAction) {
    if(!isNew(editAction)) return false;
    let numberKeyWrapping = 0;
    forEach(editAction.model.value, (child, k) => {
      if(child) { numberKeyWrapping++; }
    });
    return numberKeyWrapping == 1;
  }
  function isInsertAll(editAction) {
    if(!isNew(editAction)) return false;
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
    if(!isNew(editAction)) return false;
    let numberKeyWrapping = 0;
    forEach(editAction.model.value, (child, k) => {
      if(child) numberKeyWrapping++;
    });
    return numberKeyWrapping === 0;
  }
  
  function printDebug() {
    if(editActions.__debug) {
      let lastWasEditAction = false;
      console.log([...arguments].map((x, index) => isEditAction(x) ? (lastWasEditAction = true, "\n├┬") + addPadding(uneval(x), "│├") : (index == 0 ? "" : lastWasEditAction ? (lastWasEditAction=false, "\n├ ") : " ") + (typeof x == "string" ? x : uneval(x))).join(""));
    }
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
  
  // Given a pair (prog, ctx), walks the context up by the provided key or offset and returns a [new prog, new ctx]
  function walkUpCtx(upKeyOrOffset, prog, ctx) {
    if(!ctx) {
      console.log("Error, apply with Up but no ctx: ", keyOrOffsetToString(upKeyOrOffset), uneval(prog), uneval(ctx));
    }
    var {hd: {keyOrOffset: keyOrOffset, prog: originalProg}, tl: originalUpCtx} = ctx;
    if(isOffset(upKeyOrOffset)) {
      if(!isOffset(keyOrOffset)) {
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
      if(self.isRemove && isOffset(self.keyOrOffset)) {
        if(self.keyOrOffset.count === 0 && self.keyOrOffset.newLength === 0) {
          let k = self.keyOrOffset.oldLength !== undefined ? self.keyOrOffset.oldLength : "";
          let c = isIdentity(self.subAction) && k == "" ? "" : stringOf(self.subAction);
          return "RemoveAll(" + c + (k != "" ? ", " : "") + k + ")";
        } else if(self.keyOrOffset.newLength === undefined && self.keyOrOffset.oldLength === undefined) {
          let c = isIdentity(self.subAction) ? "" : ", " + stringOf(self.subAction);
          return "Remove(" + self.keyOrOffset.count + c + ")";
        } else {
          return "RemoveExcept(" + keyOrOffsetToString(self.keyOrOffset) + (isIdentity(self.subAction) ? "": ", " + stringOf(self.subAction)) + ")";
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
      let selfIsReuse = model.ctor == TypeNewModel.Reuse;
      let str = "";
      let selfIsInsert = false;
      let selfIsInsertAll = false;
      let selfIsPureNew = false;
      if(selfIsReuse) {
        str = model.create ? "ReuseAsIs(" : "Reuse(";
      } else {
        if(typeof model.value != "object") {
          str += "New(" + uneval(model.value);
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
          str += ", " + (insertModelNecessary ? "InsertModel(" : "");
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
            str += ","+extraSpace+" " + addPadding(stringOf(second), "  ");
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
    if(editActions.__debug) {
      console.log("mapUpHere(", stringOf(editAction), stringOf(pathToHere));
    }
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
      if(newSubAction = editAction.subAction) {
        return editAction;
      } else {
        return {...editAction, subAction: newSubAction}; 
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
    if(!isEditAction(subAction)) return subAction;
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
      return New(mapChildren(subAction.childEditActions, (k, c) => UpIfNecessary(keyOrOffset, c)), subAction.model);
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
  
  /** How to traverse and manipulate edit actions */
  // Low-level
  var transform = {};
  transform.isReuse = isReuse;
  transform.isNew = isNew;
  transform.valueIfNew = valueIfNew;
  function childIfReuse(editAction, key) {
    return key in editAction.childEditActions ? Up(key, editAction.childEditActions[key]) : Reuse();
  }
  transform.childIfReuse = childIfReuse;
  function isRaw(editAction) {
    return !isEditAction(editAction);
  }
  transform.isRaw = isRaw;
  
  transform.forEachChild = forEachChild;
  transform.forEach = forEach;
  transform.extractKeep = argumentsIfKeep;
  transform.extractReplace = argumentsIfReplace;
  // High-level
  function preMap(editAction, f, inContext) {
    editAction = f(editAction, inContext);
    if(!isEditAction(editAction)) return editAction;
    if(editAction.ctor == Type.New) {
      if(isReuse(editAction)) {
        return New(mapChildren(editAction.childEditActions,
        (child, k) => preMap(Up(k, child), f, Up(k, inContext))), editAction.model);
      } else {
        return New(mapChildren(editAction.childEditActions,
        (child, k) => preMap(child, f, inContext)), editAction.model);
      }
    }
    if(editAction.ctor == Type.Down) {
      return SameDownAs(editAction)(
        editAction.keyOrOffset, preMap(editAction.subAction, f, Up(editAction.keyOrOffset, inContext)));
    }
    if(editAction.ctor == Type.Up) {
      return Up(editAction.keyOrOffset, preMap(editAction.subAction, f, Down(editAction.keyOrOffset, inContext)));
    }    
    if(editAction.ctor == Type.Concat) {
      let newFirst = preMap(editAction.first, f, inContext);
      let newSecond = preMap(editAction.second, f, inContext);
      let newFirstLength = outLength(newFirst);
      if(newFirstLength === undefined) newFirstLength = editAction.count;
      return Concat(newFirstLength, newFirst, newSecond, editAction.replaceCount, editAction.firstReuse, editAction.secondReuse);
    }
    if(editAction.ctor == Type.Custom) {
      let newSub = preMap(editAction.subAction, f, inContext);
      return Custom(newSub, editAction.lens);
    }
    if(editAction.ctor == Type.Choose) {
      let newSubs = Collection.map(editAction.subActions, subAction => preMap(subAction, f, inContext));
      return Choose(newSubs);
    }
    return editAction;
  }
  transform.preMap = preMap;
  editActions.transform = transform;
  
})(editActions)

if(typeof module === "object") {
  module.exports = editActions;
}