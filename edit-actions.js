/*******************************
 * File:        edit-actions.js
 * Author:      Mikaël Mayer
 * Around date: July 2020
 *******************************/

var editActions = {};

(function(editActions) {
  editActions.__absolute = false;
  editActions.__syntacticSugar = true;
  editActions.__syntacticSugarFork = true;
  editActions.choose = editActions.choose ? editActions.choose : Symbol("choose"); // For evaluation purposes.
  
  var Type = {
     Up: "Up",       // Navigate the tree
     Down: "Down",
     Reuse: "Reuse", // Reuse the tree
     New: "New",     // Create a new tree
     Concat: "Concat", // Concatenates two instances of monoids.
     Fork: "Fork",   // A Concat that works on two sub-slices of an array, string or maps. Formerly ReuseArray
     Custom: "Custom",
     UseResult: "UseResult", // Not supported for andThen, backPropagation and merge.
     Sequence: "Sequence", // Can be encoded with Custom
     Choose: "Choose", // Alternative choice options
  };
  function isEditAction(obj) {
    return typeof obj == "object" && obj.ctor in Type;
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
      for(let elem of it) {
        if(!result) {
          result = elem;
          continue;
        }
        return defaultValue;
      }
      return result || defaultValue;
    },
    onlyElemOfCollectionOrDefaultCallback: function(c, defaultValue, callback) {
      return callback(Collection.Collection.onlyElemOrDefault(c, defaultValue));
    },
    firstOrDefault: function firstOrDefault(c, defaultValue) {
      const it = c[Symbol.iterator]();
      for(let elem of it) {
        return elem;
      }
      return defaultValue;
    },
    firstOrDefaultCallback: function firstOrDefaultCallback(c, defaultValue, callback) {
      return callback(Collection.firstOrDefault);
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
  
  /* apply(New(1), x) = 1                 */
  /* apply(New({0: New(2)}, []), x) = [2] */
  /* apply(New([Reuse()]), x) = [x]       */
  function New(childEditActions, model) {
    if(typeof childEditActions === "undefined" && typeof model === "undefined") {
      childEditActions = {};
    } else {
      if(typeof childEditActions !== "object" && typeof model === "undefined") {
        model = childEditActions;
        childEditActions = {};
      }
      if(typeof childEditActions === "object" && typeof model === "undefined") {
        model = Array.isArray(childEditActions) ? [] : {};
      }
    }
    let outsideLevel = 0;
    for(let k in childEditActions) {
      let child = childEditActions[k];
      if(typeof child == "string" || typeof child == "number" || typeof child == "undefined" || typeof child == "boolean" || typeof child == "object" && !isEditAction(child)) {
        if(!(Array.isArray(child) && isEditAction(child[0]))) {
          child = New(child);
        }
        childEditActions = {...childEditActions, [k]: child};
      }
      outsideLevel = Math.max(child.outsideLevel || 0, outsideLevel);
    }
    return { ctor: Type.New, model: model, childEditActions: childEditActions || {}, outsideLevel};
  }
  editActions.New = New;
  
  // apply(Reuse({a: New(1)}), {a: 2, b: 3}) = {a: 1, b: 3}
  function Reuse(childEditActions) {
    var outsideLevel = 0;
    childEditActions = mapChildren(childEditActions, (k, c) => {
      if(!isEditAction(c)) {
        c = New(c);
      }
      outsideLevel = Math.max(outsideLevel, c.outsideLevel - 1);
      return c;
    });
    return {ctor: Type.Reuse, childEditActions: childEditActions || {}, outsideLevel};
  }
  editActions.Reuse = Reuse;

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
    return offset.count == 0 && offset.oldLength === undefined && offset.newLength === undefined;
  }
  
  function Up(keyOrOffset, subAction) {
    if(arguments.length == 1) subAction = Reuse();
    if(editActions.__absolute) {
      printDebug("Up", keyOrOffset, subAction);
      throw "Unexpected Up() in absolute mode"
    }
    let subActionIsPureEdit = isEditAction(subAction);
    if(arguments.length > 2 || arguments.length == 2 && !subActionIsPureEdit && (typeof subAction == "string" || typeof subAction == "number" || isOffset(subAction))) {
      return Up(arguments[0], Up(...[...arguments].slice(1)));
    }
    if(isOffset(keyOrOffset) && isOffsetIdentity(keyOrOffset)) return subAction;
    let ik = isOffset(keyOrOffset);
    if(subActionIsPureEdit) {
      if(subAction.ctor == Type.Up) {
        let isk = isOffset(subAction.keyOrOffset);
        if(ik && isk) {
          let newOffset = upUpOffset(keyOrOffset, subAction.keyOrOffset);
          /*if(editActions.__debug) {
            console.log("upUpOffset "+keyOrOffsetToString(keyOrOffset) + " "  + keyOrOffsetToString(subAction.keyOrOffset));
            console.log("=> "+ keyOrOffsetToString(newOffset));
          }*/
          let newDownOffset = upToDownOffset(newOffset);
          if(newDownOffset !== undefined) {
            return Down(newDownOffset, subAction.subAction);
          } else {
            return Up(newOffset, subAction.subAction);
          }
        } 
      } else if(subAction.ctor == Type.Down) {
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
      } else if(subAction.ctor == Type.New) {
        if(isFinal(subAction)) {
          return subAction;
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
  
  function Down(keyOrOffset, subAction) {
    if(arguments.length == 1) subAction = Reuse();
    //printDebug("Down", keyOrOffset, subAction);
    let subActionIsPureEdit = isEditAction(subAction);
    if(arguments.length > 2 || arguments.length == 2 && !subActionIsPureEdit && (typeof subAction == "string" || typeof subAction == "number" || isOffset(subAction))) {
      return Down(arguments[0], Down(...[...arguments].slice(1)));
    }
    if(isOffset(keyOrOffset) && isOffsetIdentity(keyOrOffset)) return subAction;
    let ik = isOffset(keyOrOffset);
    if(subActionIsPureEdit) {
      if(subAction.ctor == Type.Down) {
        let isk = isOffset(subAction.keyOrOffset);
        if(ik && isk) {
          let newOffset = downDownOffset(keyOrOffset, subAction.keyOrOffset);
          return Down(newOffset, subAction.subAction);
        }
      } else if(subAction.ctor == Type.Up) {
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
      } else if(subAction.ctor == Type.New) {
        if(isFinal(subAction)) {
          return subAction;
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
    return {ctor: Type.Down, keyOrOffset: keyOrOffset, subAction: subAction};
  }
  editActions.Down = Down;

  // apply(Concat(1, New([Down(5)]), Reuse()), [0, 1, 2, 3, 4, x]) = [x] ++ [0, 1, 2, 3, 4, x]
  function Concat(count, first, second) {
    if(!isEditAction(first)) first = New(first);
    if(!isEditAction(second)) second = New(second);
    let result = {ctor: Type.Concat, count: count, first: first, second: second};
    let [inCount, outCount, left, right]= argumentsIfFork(result);
    if(right !== undefined) {
      let [keepCount, keepSub] = argumentsIfForkIsKeep(inCount, outCount, left, right);
      if(keepSub !== undefined) {
        let [keepCount2, keepSub2] = argumentsIfKeep(keepSub);
        if(keepSub2 !== undefined) {
          return Keep(keepCount + keepCount2, keepSub2);
        }
      } else {
        let [deleteCount, deleteSub] = argumentsIfForkIsDelete(inCount, outCount, left, right);        
        if(deleteSub !== undefined) {
          let [deleteCount2, deleteSub2] = argumentsIfDelete(deleteSub);
          if(deleteSub2 !== undefined) {
            return Delete(deleteCount + deleteCount2, deleteSub2);
          }
        }
      }
    }
    // TODO: Optimizations when first and second are just Reuse.
    return result;
  }
  editActions.Concat = Concat;
  
  // apply(Custom(Down("x"), n => n + 1, ean => New(ean.model - 1)), {x: 2}) = 3
  function Custom(subAction, applyOrLens, update, name) {
     var lens;
     if(typeof applyOrLens == "object") {
       lens = {...applyOrLens};
     } else {
       lens = {apply: applyOrLens, update: update, name: (applyOrLens && applyOrLens.name) || (update && update.name) || name ||  "<anonymou>"};
     }
     let ap = lens.apply;
     lens.apply = function(input) {
       lens.cachedInput = input;
       let output = ap(input);
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
  // = apply(e2, apply(e1, x, xctx), apply(ectx, x, xctx))
  function Sequence(first, second, ctx) {
    if(arguments.length == 0) return Reuse();
    if(isIdentity(second)) { // this case we can simplify - We assume that we called Sequence because andThen is not working, so we don't want to run andThen to simplify.
      return first;
    }
    return {ctor: Type.Sequence, first, second, ctx};
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
      case Type.Reuse:
        return Reuse(mapChildren(editAction.childEditActions, (k, c) => first(c)));
      case Type.Concat:
        return Concat(editAction.count, first(editAction.first), first(editAction.second));
      case Type.Up:
        return Up(editAction.keyOrOffset, first(editAction.subAction));
      case Type.Down:
        return Down(editAction.keyOrOffset, first(editAction.subAction));
      case Type.Choose:
        return first(Collection.firstOrDefault(editAction.subActions, Reuse()));
      default:
        return editAction;
    }
  }
  editActions.first = first;
  
  //// HELPERS: Fork, Insert, Keep, Delete //////
  
  // A Concat that operates on two non-overlapping places of an array or string
  function Fork(inCount, outCount, first, second) {
    // TODO: Merge Reuse using mapUpHere
    if(isIdentity(first) && isIdentity(second)) {
      return second;
    }
    if(isEditAction(outCount) && second === undefined) {
      second = first;
      first = outCount;
      outCount = outLength(first, inCount);
      if(outCount === undefined) {
        console.log("/!\\ Warning, could not infer outCount for " + stringOf(first) + " under context " + inCount);
        outCount = inCount;
      }
    }
    return Concat(outCount, Down(Offset(0, inCount), first), Down(Offset(inCount), second));
  }
  editActions.Fork = Fork;
  
  function argumentsIfDownOffset(editAction, defaultOffsetIfNone) {
    //printDebug("argumentsIfDownOffset", editAction);
    let recoveredOffset, recoveredSubAction;
    if(editAction.ctor == Type.Down) {
      if(isOffset(editAction.keyOrOffset)) {
        recoveredOffset = editAction.keyOrOffset;
        recoveredSubAction = editAction.subAction;
      }
    } else if(editAction.ctor == Type.New && !hasChildEditActions(editAction)) { // An optimization could have occurred.
      recoveredOffset = defaultOffsetIfNone;
      recoveredSubAction = editAction;
    } else {
      return [];
    }
    //printDebug("argumentsIfDownOffset success", recoveredOffset, recoveredSubAction); 
    return [recoveredOffset, recoveredSubAction ];
  }
  
  // Return true if an edit action can be viewed as a fork
  function isFork(editAction) {
    let [inCount, outCount, first, second] = argumentsIfFork(editAction);
    return second !== undefined;
  }
  
  // Returns the [inCount, outCount, first, second] if the element is a Fork, such that:
  // applyZ(Concat(outCount, Down(Offset(0, inCount), first), Down(Offset(inCount), second)), rrCtx) = applyZ(editAction, rrCtx);
  function argumentsIfFork(editAction) {
    // - If not a concat, return.
    if(editAction.ctor !== Type.Concat) return [];
    let [firstOffset, firstSubAction] = argumentsIfDownOffset(editAction.first, undefined);
    let [secondOffset, secondSubAction] = argumentsIfDownOffset(editAction.second, undefined);
    // If right cannot have offsets (e.g. neither Down or New), return
    if(secondSubAction === undefined) {
      if(editAction.second.ctor == Type.Reuse || isFork(editAction.second)) {
        // We can treat it Concat(n, X, Reuse(...)) as a Fork/Insert.
        /**Proof
           applyZ(Concat(n, X, Reuse(R)), rrCtx)
         = applyZ(Concat(n, Down(Offset(0, 0), Up(Offset(0, 0), X)), Down(Offset(0), Reuse(R))), rrCtx)
         
         and the Down(Offset(0), ) can be removed.
        */
        return [0, editAction.count, Up(Offset(0, 0), editAction.first), editAction.second];
      }
      if(isFork(editAction.second)) {
        secondOffset = Offset(0);
        secondSubAction = editAction.second;
      } else if(firstOffset !== undefined && firstOffset.newLength !== undefined && isFinal(editAction.second)) {
        secondOfDiff1 = Offset(0);
        secondSubAction = editAction.second;
      } else {
        return [];
      }
    }
    // If left cannot have offsets (e.g. neither Down or New), return
    if(firstSubAction === undefined) {
      if(editAction.first.ctor == Type.Reuse) {
        // We can treat Concat(n, Reuse(...), x) as a Fork.
        /** Proof:
           applyZ(Concat(n, Reuse(R), X), rrCtx)
         = applyZ(Concat(n, Down(Offset(0, n), Up(Offset(0, n), Reuse(R))), Down(Offset(n), Up(Offset(n), X))), rrCtx)
         
         However, Up(Offset(0, n)) does not have any effect since Reuse has length n.
        */
        return [editAction.count, editAction.count, editAction.first, Up(editAction.count, editAction.second)]
      } else if(isFinal(editAction.first) && secondOffset.count == 0) {
        return [0, editAction.count, editAction.first, editAction.second];
      }
      return [];
    }
    
    // - If both left and right are New, i.e. no implicit offset, return.
    if(firstOffset !== undefined && firstOffset.newLength === undefined) return [];
 
    if(firstOffset === undefined) {
      /** Proof:
      applyZ(Concat(o, New({...}), Down(Offset(c2, n2), X)), rrCtx);
      = applyZ(Concat(o, Down(Offset(0, c2), Up(Offset(0, c2), New({...}))), Down(Offset(c2, n2), X)), rrCtx)
      */
      return [secondOffset.count, editAction.count, Up(Offset(0, secondOffset.count), firstSubAction), secondSubAction];
    } else if(secondOffset === undefined) {
      /** Proof:
      applyZ(Concat(o, Down(Offset(c1, n1), X), New({...})), rrCtx);
      = applyZ(Concat(o, Down(Offset(0, c1+n1), Down(Offset(c1, n1, c1+n1), X)), Down(Offset(c1+n1), Up(Offset(c1+n1), New({...})))), Down(Offset(c2, n2), X)), rrCtx)
      */
      let c1n1 = firstOffset.count + firstOffset.newLength;
      secondSubAction = Up(Offset(c1n1), secondSubAction);
      if(firstOffset.count > 0) {
        firstSubAction = Down(Offset(firstOffset.count, firstOffset.newLength, c1n1), firstSubAction);
      }
      return [c1n1, editAction.count, firstSubAction, secondSubAction];
    }
    // - If left and right are offsets that overlap, or the left offset is not to the left of the right offset, return
    if(firstOffset.count + firstOffset.newLength > secondOffset.count) {
      return [];
    }
    
    // Ok at this point, we can create a Fork.
    // Choose a number between C1+n1 (lower bound) and c2
    // If the first offset starts at 0 and its length is greater than zero, then we ensure that firstSubAction stays the same.
    // Otherwise, we ensure that secondAction somehow the same.
    let inCount = firstOffset.count == 0 && firstOffset.newLength > 0 ? firstOffset.count + firstOffset.newLength : secondOffset.count;
    /** Proof:
       applyZ(Concat(o, Down(Offset(c1, n1), X), Down(Offset(c2, n2), Y)), rrCtx);
       = applyZ(Concat(o, Down(Offset(0, ic), Down(Offset(C1, n1, ic), X)),
         Down(Offset(ic), Down(Offset(c2-ic, n2), Y))), rrCtx)
    */
    if(firstOffset.count != 0 || firstOffset.newLength != inCount) {
      firstSubAction = Down(Offset(firstOffset.count, firstOffset.newLength, inCount), firstSubAction);
    }
    if(secondOffset.newLength !== undefined || secondOffset.count > inCount) {
      secondSubAction = Down(Offset(secondOffset.count - inCount, secondOffset.newLength), secondSubAction);
    }
    return [inCount, editAction.count, firstSubAction, secondSubAction];
  }
  
  // returns [count, subAction] if the argument is a Keep
  function argumentsIfKeep(editAction) {
    //printDebug("argumentsIfKeep", editAction);
    let [inCount, outCount, first, second] = argumentsIfFork(editAction);
    return argumentsIfForkIsKeep(inCount, outCount, first, second);
  }
  // returns [count, subAction] if the fork arguments describe a Keep
  function argumentsIfForkIsKeep(inCount, outCount, first, second) {
    //printDebug("argumentsIfForkIsKeep", inCount, outCount, first, second);
    if(second === undefined || inCount != outCount || !isIdentity(first)) return [];
    //printDebug("argumentsIfForkIsKeep success", [inCount, second]);
    return [inCount, second];
  }
  function argumentsIfDelete(editAction) {
    let [inCount, outCount, first, second] = argumentsIfFork(editAction);
    return argumentsIfForkIsDelete(inCount, outCount, first, second);
  }
  function argumentsIfForkIsDelete(inCount, outCount, first, second) {
    if(outCount === 0 && inCount > 0) {
      return [inCount, second];
    }
    return [];
  }
  function argumentsIfForkIsInsert(inCount, outCount, first, second) {
    if(outCount > 0 && inCount === 0) {
      return [outCount, first, second];
    }
    return [];
  }
  
  // first is the thing to insert (in the current context of the slice), second is the remaining (default is Reuse()).
  function Insert(count, first, second = Reuse()) {
    return Concat(count, first, second);
    /*return Fork(0, count, Up(Offset(0, 0, undefined), first), second || Reuse());
    */
  }
  function InsertRight(count, first, second) {
    return Concat(count, first, second);
    /*return Fork(0, count, Up(Offset(0, 0, undefined), first), second || Reuse());
    */
  }
  editActions.Insert = Insert;
  function Keep(count, subAction) {
    return Fork(count, count, Reuse(), subAction);
    // Concat(count, Down(Offset(0, count)), Down(Offset(count, subAction))
  }
  editActions.Keep = Keep;
  // Delete back-propagates deletions, not building up the array. To build up the array, prefix the Fork with a Down(Offset(0, totalLength, undefined), 
  function Delete(count, subAction = Reuse()) {
    return Fork(count, 0, Down(Offset(0, 0, count)), subAction);
    // return Down(Offset(count), subAction);
    // return Fork(count, 0, New(?), subAction)
  }
  editActions.Delete = Delete;
  // Replace needs the length of replacement as a check and for reasoning purposes
  function Replace(start, end, replaced, subAction, nextAction = Reuse()) {
    return Keep(start, Fork(end - start, replaced, subAction, nextAction));
  }
  editActions.Replace = Replace;
  // ReuseOffset(offset, X) is to Down(offset, X)
  // what Reuse({key: X}) is to Down(key, X)
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
      let wrapped;
      /*if(replaced === 0) {
        wrapped = Delete(offset.newLength);
      } else {**/
        wrapped = Fork(offset.newLength, replaced, subAction, Reuse());
      /*}*/
      if(offset.count > 0) {
        wrapped = Keep(offset.count, wrapped);
      }
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
  
  function isKeepInsertDelete(editAction) {
    return isDelete(editAction) ||
      isInsert(editAction) ||
      isKeep(editAction) ||
      isIdentity(editAction);
  }
  function isDelete(editAction) {
    let [inCount, outCount, first, second] = argumentsIfFork(editAction);
    return second !== undefined && outCount == 0 && inCount != 0;
  }
  function isInsert(editAction) {
    let [inCount, outCount, first, second] = argumentsIfFork(editAction);
    return second !== undefined && inCount == 0 && outCount > 0;
  }
  function isInsertRight(editAction) {
    return editAction.ctor == Type.Concat &&
    isKeepInsertDelete(editAction.first);
  }
  function isKeep(editAction) {
    let [inCount, subAction] = argumentsIfKeep(editAction);
    return subAction !== undefined;
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
    // Merge two offset contexts if necessary
    /*if(typeof ctx == "object" && !(ctx.ctor == Type.Up || ctx.ctor == Type.Down) && kIsOffset && isOffset(ctx.hd.keyOrOffset)) {
      return List.cons(ContextElem(downDownOffset(ctx.hd.keyOrOffset, keyOrOffset), ctx.hd.prog), ctx.tl);
    } else {*/
    if(kIsOffset && isOffsetIdentity(keyOrOffset)) {
      return ctx;
    }
    let newContextElem = ContextElem(keyOrOffset, prog);
    return List.cons(newContextElem, ctx);
    //}
  }
  
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
    if(typeof editAction !== "object" || !("ctor" in editAction) || !(editAction.ctor in Type)) return apply(New(editAction), prog, ctx, resultCtx);
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
    if(editAction.ctor == Type.Sequence) {
      // Sequence(E1, E2, ECtx)
      // = Custom(E1, ((x, r, rCtx) => apply(E2, x, apply(ECtx, rrCtx)), ?))
      // back-propagation semantics?
      let prog2 = apply(editAction.first, prog, ctx, resultCtx);
      let ctx2 = apply(editAction.ctx, prog, ctx, resultCtx);
      return apply(editAction.second, prog2, ctx2, resultCtx);
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
      return Collection.map(editAction.subActions, subAction =>
        apply(subAction, prog, ctx, resultCtx)
      );
    }
    let isNew = editAction.ctor == Type.New;
    let model = modelToCopy(editAction, prog);
    let childEditActions = editAction.childEditActions;
    if(!hasChildEditActions(editAction)) {
      return model;
    } else if(prog === undefined && !isNew) {
      console.log("apply problem. undefined program and child edit actions....");
      editActions.debug(editAction);
      console.log("context:\n",List.toArray(ctx).map(x => uneval(x.prog, "  ")).join("\n"));
    }
    let t = treeOpsOf(model);
    let o = t.init();
    for(let k in model) {
      t.update(o, k, t.access(model, k));
    }
    for(let k in childEditActions) {
      let newProg = editActions.__absolute ? ctx == undefined ? prog : List.last(ctx).prog : isNew ? prog : prog[k];
      let newCtx = editActions.__absolute ? undefined : isNew ? ctx : AddContext(k, prog, ctx);
      t.update(o, k,
         apply(childEditActions[k], newProg, newCtx, AddContext(k, o, resultCtx)));
    }
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
  function andThen(secondAction, firstAction, firstActionContext = undefined) {
    if(editActions.__debug) {
      console.log("andThen(");
      console.log(stringOf(secondAction));
      console.log(stringOf(firstAction));
      console.log("-|" + addPadding(stringOf(firstActionContext), "  "));
    }
    let recurse = /*customRecurse || */editActions.__debug ? andThenWithLog : andThen;
    let isSecondRaw = !isEditAction(secondAction);
    if(isSecondRaw) { // Happens when secondAction is a context.
      if(typeof secondAction == "object") {
        secondAction = {ctor: Type.New, childEditActions: secondAction, model: {}};
      } else {
        secondAction = New(secondAction);
      }
    }
    /** Proof:
        apply(andThen(Reuse(), E1, ECtx), r, rCtx)
        = apply(E1, r, rCtx)
        = apply(Reuse(), apply(E1, r, rCtx), apply(ECtx, r, rCtx))
    */
    if(isIdentity(secondAction)) return firstAction;
      
    if(secondAction.ctor == Type.Choose) {
      return Choose(...Collection.map(secondAction.subActions, subAction => andThen(subAction, firstAction, firstActionContext)));
    } else if(firstAction.ctor == Type.Choose) {
      return Choose(...Collection.map(firstAction.subActions, subAction => andThen(secondAction, subAction, firstActionContext)));
    } else if(secondAction.ctor == Type.Up) {
      if(firstActionContext === undefined) {
        console.trace("Error empty context for Up in andThen", firstAction, ";", secondAction);
      }
      if(firstActionContext.ctor == Type.Up) {
        /**
          Proof:
            apply(andThen(Up(k, E2), E1, (k, E0, Up(m, X))::E2Ctx), r[m], (m, r)::rCtx)
          = apply(Up(m, andThen(Up(k, E2), Down(m, E1), (k, E0, X)::E2Ctx)), r[m], (m, r)::rCtx)  -- AP-UP-SECOND-UP
          = apply(andThen(Up(k, E2), Down(m, E1), (k, E0, X)::E2Ctx), r, rCtx)
          = apply(Up(k, E2), apply(Down(m, E1), r, rCtx), apply((k, E0, X)::E2Ctx, r, rCtx)) -- iND
          = apply(Up(k, E2), apply(E1, r[m], (m, r)::rCtx), apply((k, E0, X)::E2Ctx, r, rCtx))
          = apply(Up(k, E2), apply(E1, r[m], (m, r)::rCtx), apply((k, E0, Up(m, X))::E2Ctx, r[m], (m, r)::rCtx)) -- GOAL
          QED
        */
        if(editActions.__debug) {
          console.log("Pre-pending Up("+ keyOrOffsetToString(firstActionContext.keyOrOffset)+", |)");
        }
        return Up(firstActionContext.keyOrOffset,
          recurse(
            secondAction,
            Down(firstActionContext.keyOrOffset, firstAction),
            firstActionContext.subAction));
      }
      if(firstActionContext.ctor == Type.Down) {
        /**
          Proof:
            apply(andThen(Up(k, E2), E1, (k, E0, Down(m, X))::E2Ctx), r, rCtx)
          = apply(Down(m, andThen(Up(k, E2), Up(m, E1), (k, E0, X)::E2Ctx)), r, rCtx) -- AT-UP-SECOND-DOWN
          = apply(andThen(Up(k, E2), Up(m, E1), (k, E0, X)::E2Ctx), , r[m], (m, r)::rCtx) -- AP-DOWN
          = apply(Up(k, E2), apply(Up(m, E1), r[m], (m, r)::rCtx), apply((k, E0, X)::E2Ctx, r[m], (m, r)::rCtx)) -- IND
          = apply(Up(k, E2), apply(E1, r, rCtx), apply((k, E0, X)::E2Ctx, r[m], (m, r)::rCtx)) --AP-UP
          = apply(Up(k, E2), apply(E1, r, rCtx), apply((k, E0, Down(m, X))::E2Ctx, r, rCtx)) --APCTX-UP -- GOAL
          QED
        */
        if(editActions.__debug) {
          console.log("Pre-pending Down("+keyOrOffsetToString(firstActionContext.keyOrOffset), ", |)");
        }
        return Down(firstActionContext.keyOrOffset,
          recurse(
            secondAction,
            Up(firstActionContext.keyOrOffset, firstAction),
            firstActionContext.subAction));
      }
      /** Proof:
        applyZ(andThenZ(Up(ko, E2), (E1, ECtx)), (r, rCtx))
        = applyZ(andThenZ(E2, walkUpActionCtx(ko, E1, EECtx)), (r, rCtx)) -- AT-UP-SECOND
        = applyZ(E2, applyZip(walkUpActionCtx(ko, E1, EECtx)), (r, rCtx))
        = applyZ(Up(ko, E2), applyZip((E1, EECtx), (r, rCtx)))
        QED;      
      */
      let [finalFirstAction, finalFirstActionContext, newSecondUpOffset] = walkUpActionCtx(secondAction.keyOrOffset, firstAction, firstActionContext);
      return recurse(
            newSecondUpOffset ? Up(newSecondUpOffset, secondAction.subAction) : secondAction.subAction,finalFirstAction, finalFirstActionContext);
      // firstAction is Reuse, New, Custom, Concat, UseResult or Sequence
      // secondAction is Down, Reuse, New, UseResult or Sequence
    } else if(firstAction.ctor == Type.Down) {
      if(isOffset(firstAction.keyOrOffset)) {
        /**
          Proof for offset when there is already an offset on r
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
          console.log("Pre-pending Down("+keyOrOffsetToString(firstAction.keyOrOffset)+", |)");
        }
        return Down(firstAction.keyOrOffset, recurse(secondAction, firstAction.subAction, Up(firstAction.keyOrOffset, firstActionContext)));
      } else {
        /**
          Proof:
          apply(andThen(E2, Down(f, E1), (k, E0, X)::ECtx), r, rCtx)
          = apply(Down(f, andThen(E2, E1, (k, E0, Up(f, X))::ECtx)), r, rCtx)     -- AT-DOWN-FIRST
          = apply(andThen(E2, E1, (k, E0, Up(f, X))::ECtx), r[f], (f, r)::rCtx) -- AP-DOWN
          = apply(E2, apply(E1, r[f], (f, r)::rCtx), apply((k, E0, Up(f, X))::ECtx, r[f], (f, r)::rCtx)) -- IND
          = apply(E2, apply(E1, r[f], (f, r)::rCtx), apply((k, E0, X)::ECtx, r, rCtx)) -- IND
          = apply(E2, apply(Down(f, E1), r, rCtx), apply((k, E0, X)::ECtx, r, rCtx)) -- GOAL
          QED.
        */
        if(editActions.__debug) {
          console.log("Pre-pending Down("+ keyOrOffsetToString(firstAction.keyOrOffset)+", |)");
        }
        return Down(firstAction.keyOrOffset, recurse(secondAction, firstAction.subAction, Up(firstAction.keyOrOffset, firstActionContext)));
      }
      // firstAction is Up, Reuse, New, Custom, Concat, UseResult, or Sequence
    } else if(firstAction.ctor == Type.Up) {
      /**
        Proof for keys:
        
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
      // firstAction is Reuse, New, Custom, Concat, UseResult, or Sequence
      // secondAction is Custom, Up, Down, Reuse, New, Concat, UseResult or Sequence
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
      return Custom(recurse(secondAction.subAction, firstAction, firstActionContext), {...secondAction.lens});
      // firstAction is Reuse, New, Custom, Concat, UseResult or Sequence
      // secondAction is Up, Down, Reuse, New, Concat, UseResult or Sequence
    } else if(secondAction.ctor == Type.Concat) {
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
      let newSecondFirst = recurse(secondAction.first, firstAction, firstActionContext);
      if(editActions.__debug) {
        console.log("Filling Concat("+secondAction.count+", ... , |)", secondAction.count);
      }
      let newSecondSecond = recurse(secondAction.second, firstAction, firstActionContext);
      return Concat(secondAction.count, newSecondFirst, newSecondSecond);
      // firstAction is Reuse, New, Custom, Concat, UseResult or Sequence
      // secondAction is Up, Down, Reuse, New, UseResult or Sequence
    } else if(firstAction.ctor == Type.Sequence) {
      /** Can we combine a Sequence with another?
         Can we just permute so that the Sequence is on second?
         apply(andThen(E2, Sequence(E0, E1, E0Ctx), E1Ctx), r, rCtx)
         = apply(andThen(Sequence(E1, E2, E1Ctx'), E0, E0Ctx), r, rCtx)
         = apply(Sequence(E1, E2, E1Ctx'), apply(E0, r, rCtx), apply(E0Ctx, r, rCtx));
         = apply(E2, apply(E1, apply(E0, r, rCtx), apply(E0Ctx, r, rCtx)), apply(E1Ctx', apply(E0, r, rCtx), apply(E0Ctx, r, rCtx)))
         
         // Almost the same except we need to find E1Ctx' such that:
         
         apply(E1Ctx', apply(E0, r, rCtx), apply(E0Ctx, r, rCtx))
         ?= apply(E1Ctx, r, rCtx)
         If E1Ctx = [], then the RHS is [], and thus, for the LHS to be empty, E1Ctx' = []
         
         E1Ctx' has to have the same length and keys as E1Ctx, by induction.
         
         
         = apply(E2, apply(E1, apply(E0, r, rCtx), apply(E0Ctx, r, rCtx)), apply(E1Ctx, r, rCtx))
         = apply(E2, apply(Sequence(E0, E1, E0Ctx), r, rCtx), apply(E1Ctx, r, rCtx)) -- GOAL
         
         // E01Ctx = apply(E1Ctx, apply(E0, r, rCtx), apply(E0Ctx, r, rCtx))
         //           for some E1Ctx and E0Ctx

         = apply(E2, apply(E1, apply(E0, r, rCtx), apply(E0Ctx, r, rCtx)),
                 apply(?0, apply(E0, r, rCtx), apply(E0Ctx, r, rCtx)))
         = apply(Sequence(E1, E2, ?0  ), apply(E0, r, rCtx), apply(E0Ctx, r, rCtx))
         
         
         
         = apply(E2, apply(E1, apply(E0, r, rCtx), apply(E0Ctx, r, rCtx)), apply(ECtx, apply(E0, r, rCtx), apply(E0Ctx, r, rCtx)))
         = apply(Sequence(E1, E2, ECtx), apply(E0, r, rCtx), apply(E0Ctx, r, rCtx))
         = apply(andThen(Sequence(E1, E2, ECtx), E0, E0Ctx), ECtx), r, rCtx)
         
        -----
         
         Proof:
         
         apply(andThen(E2, Sequence(E0, E1, E0Ctx), ECtx), r, rCtx)
         ?= apply(Sequence(E0, andThen(E1, E2, ECtx), E0Ctx), r, rCtx)
         = apply(andThen(E1, E2, ECtx), apply(E0, r, rCtx), apply(E0Ctx, r, rCtx))
         = apply(E2, apply(E1, apply(E0, r, rCtx), apply(E0Ctx, r, rCtx)),
            apply(ECtx, apply(E0, r, rCtx), apply(E0Ctx, r, rCtx)))
         
Assuming ?1 = apply(E0, r, rCtx)
         ?2 = apply(E0Ctx, r, rCtx)
         apply(?0, r, rCtx) = apply(ECtx, ?1, ?2)
         apply(?0, r, rCtx) = apply(ECtx, apply(E0, r, rCtx), apply(E0Ctx, r, rCtx))
         ?0 = (Offset(0), E0, Reuse())::ECtx
         
         
         = apply(andThen(E1, E2, ?0), ?1, ?2)
         = apply(E2, apply(E1, apply(E0, r, rCtx), apply(E0Ctx, r, rCtx)), apply(ECtx, r, rCtx))
         = apply(E2, apply(Sequence(E0, E1, E0Ctx), r, rCtx), apply(ECtx, r, rCtx))
      
         Nothing is conclusive.
         We need to find a way to make sense of:
         
         apply(ECtx, apply(E0, r, rCtx), apply(E0Ctx, r, rCtx))
      */
      if(firstAction.ctx === undefined && firstActionContext === undefined) {
        // Only top-level simplification was proven.
        return Sequence(firstAction.first, andThen(firstAction.second, secondAction, undefined), undefined);
      }
      
      // No simplification found for now.
      return Sequence(firstAction, secondAction, firstActionContext);
      
      /*return Sequence(firstAction.first,
        andThen(secondAction, firstAction.second, firstActionContext), firstAction.ctx);*/
      // firstAction is Reuse, New, Custom, Concat or UseResult
      // secondAction is Reuse, New, UseResult or Sequence
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
      
      let [newFirstAction, newFirstActionContext] = walkDownActionCtx(f, firstAction, firstActionContext);
      return recurse(secondAction.subAction, newFirstAction, newFirstActionContext);
      // firstAction is Reuse, New, Custom, Concat, UseResult or Sequence
      // secondAction is Reuse, New, UseResult or Sequence
    } else if(secondAction.ctor == Type.Sequence) {
       if(secondAction.ctx === undefined && firstActionContext === undefined) {
        // Only top-level simplification was proven.
        return Sequence(recurse(secondAction.first, firstAction, undefined), secondAction.second, undefined);
      }
      /** Proof
      applyZ(andThen(Sequence(E1, E2, ECtx2), E0, ECtx), rrCtx)
      = applyZ(Sequence(andThen(E1, E0, ECtx), E2, andThen(ECtx2, E0, ECtx)), rrCtx)
      = applyZ(E2, apply(andThen(E1, E0, ECtx), rrCtx), apply(andThen(ECtx2, E0, ECtx), rrCtx))
      = applyZ(E2, apply(E1, applyZ(E0, rrCtx), applyZ(ECtx, rrCtx)), applyZ(andThen(ECtx2, E0, ECtx), rrCtx))
      = applyZ(E2, apply(E1, applyZ(E0, rrCtx), applyZ(ECtx, rrCtx)), applyZ(ECtx2, applyZ((E0, ECtx), rrCtx)))
      = applyZ(E2, apply(E1, applyZ(E0, rrCtx), applyZ(ECtx, rrCtx)), apply(ECtx2, applyZ(E0, rrCtx), applyZ(ECtx, rrCtx))))
      = applyZ(Sequence(E1, E2, ECtx2), applyZ(E0, rrCtx), applyZ(ECtx, rrCtx)) 
      QED;
      */
      return Sequence(recurse(secondAction.first, firstAction, firstActionContext), secondAction.second, recurse(secondAction.ctx, firstAction, firstActionContext));
      //return Sequence(firstAction, secondAction, firstActionContext);
      
      // firstAction is Reuse, New, Custom, Concat or UseResult
      // secondAction is Reuse, New, or UseResult
    } else if(secondAction.ctor == Type.Reuse) {
      if(firstAction.ctor == Type.Reuse) {
        /** Proof (key, context does not contain offset)
          apply(andThen(Reuse({f: E2}), Reuse({f: E1}), E2Ctx), {...f: x...}, rCtx)
        = apply(Reuse({f: andThen(E2, E1, (f, Reuse({f: E1}), Up(f))::E2Ctx)}), {...f: x...}, rCtx)   -- AT-REU 
        = {...f: apply(andThen(E2, E1, (f, Reuse({f: E1}), Up(f))::E2Ctx), X, (f, {...f: x...})::rCtx)...}  -- AP-REU
        =  {...f: apply(E2, apply(E1, x, (f, {...f: x...})::rCtx), apply((f, Reuse({f: E1}), Up(f))::E2Ctx, x, (f, {...f:x...})::rCtx)...}
        =  {...f: apply(E2, apply(E1, x, (f, {...f: x...})::rCtx), apply((f, Reuse({f: E1}), Reuse())::E2Ctx, {...f:x...}, rCtx))...}
        =  {...f: apply(E2, apply(E1, x, (f, {...f: x...})::rCtx), (f, apply(Reuse({f: E1}),  {...f: x...}, rCtx))::apply(E2Ctx, {...f:x...}, rCtx))...}
        =  {...f: apply(E2, apply(E1, x, (f, {...f: x...})::rCtx), (f, {...f: apply(E1, x, (f, {...f: x...})::rCtx)...})::apply(E2Ctx, {...f: x...}, rCtx))...}
        = apply(Reuse({f: E2}), {...f: apply(E1, x, (f, {...f: x...})::rCtx)...}, apply(E2Ctx, {...f: x...}, rCtx)) -- AP-REUSE
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
        
        //if(isIdentity(firstAction)) return secondAction; // Not correct
        let newChildren = {};
        
        for(let k in secondAction.childEditActions) {
          k = numIfPossible(k);
          let f = secondAction.childEditActions[k];
          if(k in firstAction.childEditActions) {
            let g = firstAction.childEditActions[k];
            let newCtx = Up(k, AddContext(k, firstAction, firstActionContext));
            if(editActions.__debug) {
              console.log("Inside Reuse({ " + k + ": ");
            }
            newChildren[k] = recurse(f, g, newCtx);
          } else {
            if(editActions.__debug) {
              console.log("Inside Reuse({ " + k + ": ");
            }
            newChildren[k] = recurse(f, Reuse(), Up(k, AddContext(k, firstAction, firstActionContext)));
          }
        }
        for(let k in firstAction.childEditActions) {
          let g = firstAction.childEditActions[k];
          if(!(k in secondAction.childEditActions)) {
            newChildren[k] = g;
          }
        }
        return Reuse(newChildren);
      } else if(firstAction.ctor == Type.New) {
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
        for(let k in firstAction.childEditActions) {
          k = numIfPossible(k);
          if(k in secondAction.childEditActions) {
            if(editActions.__debug) {
              console.log("Inside New({ " + k + ": ");
            }
            newChildren[k] = recurse(secondAction.childEditActions[k], firstAction.childEditActions[k], AddContext(k, firstAction, firstActionContext));
          } else {
            newChildren[k] = firstAction.childEditActions[k];
          }
        }
        return New(newChildren, firstAction.model);
      } else if(firstAction.ctor == Type.Concat) {
        /** Assume f < n, g >= n
          //   apply(Reuse({k: Ek}), r, rCtx)
  // = r[0..c[ ++c apply(Reuse({(k-c): mapUpHere(Ek, k, Offset(c, n), Up(k))}), r[c..c+n[, (Offset(c, n), r)::rCtx)
        
    Proof:
   apply(andThen(Reuse({f: E2m, g: E2p}), Concat(n, E1f, E1s), ECtx), r, rCtx);
= apply(
  Concat(n,
    andThen(
      Reuse({f: mapUpHere(E2m, f, Offset(0, n), Up(k))}),
      E1f,
      (Offset(0, n), Concat(n, E1f, E1s), Reuse())::ECtx),
    andThen(
      Reuse({(g-n): mapUpHere(E2p, g, Offset(n), Up(g))}),
      E1s,
      (Offset(n), Concat(n, E1f, E1s), Reuse())::ECtx)),
  r, rCtx) -- AT-REUSE-SECOND-CONCAT-FIRST
= apply(
  andThen(
    Reuse({f: mapUpHere(E2m, f, Offset(0, n), Up(k))}),
    E1f,
    (Offset(0, n), Concat(n, E1f, E1s), Reuse())::ECtx),
  r, rCtx)
  ++n
  apply(
  andThen(
    Reuse({(g-n): mapUpHere(E2p, g, Offset(n), Up(g))}),
    E1s,
    (Offset(n), Concat(n, E1f, E1s), Reuse())::ECtx),
  r, rCtx)
= apply(
  Reuse({f: mapUpHere(E2m, f, Offset(0, n), Up(k))}),
    apply(E1f, r, rCtx),
  apply((Offset(0, n), Concat(n, E1f, E1s), Reuse())::ECtx, r, rCtx))
  ++n
  apply(
  Reuse({(g-n): mapUpHere(E2p, g, Offset(n), Up(g))}),
    apply(E1s, r, rCtx),
    apply((Offset(n), Concat(n, E1f, E1s), Reuse())::ECtx, r, rCtx))
= apply(E1f, r, rCtx)[
  f ->
    apply(
      mapUpHere(E2m, f, Offset(0, n), Up(k)),
    apply(E1f, r, rCtx)[f],
    (f, apply(E1f, r, rCtx))::apply((Offset(0, n), Concat(n, E1f, E1s), Reuse())::ECtx, r, rCtx))
] ++n apply(E1s, r, rCtx)[
  (g - n) ->
  apply(
  mapUpHere(E2p; g, Offset(n), Up(g)),
    apply(E1s, r, rCtx)[g-n],
    (g-n, apply(E1s, r, rCtx))::apply((Offset(n), Concat(n, E1f, E1s), Reuse())::ECtx, r, rCtx))
]
= apply(E1f, r, rCtx)[
  f ->
    apply(
      mapUpHere(E2m, f, Offset(0, n), Up(k)),
    apply(E1f, r, rCtx)[f],
    (f-0, (apply(E1f, r, rCtx) ++n apply(E1s, r, rCtx))[0, n])::apply((Offset(0, n), Concat(n, E1f, E1s), Reuse())::ECtx, r, rCtx))
] ++n apply(E1s, r, rCtx)[
  (g - n) ->
  apply(
  mapUpHere(E2p; g, Offset(n), Up(g)),
    apply(E1s, r, rCtx)[g-n],
    (g-n, (apply(E1f, r, rCtx) ++n apply(E1s, r, rCtx)[n...])::apply((Offset(n), Concat(n, E1f, E1s), Reuse())::ECtx, r, rCtx))
]
= apply(E1f, r, rCtx)[
  f ->
    apply(
      mapUpHere(E2m, f, Offset(0, n), Up(k)),
    apply(E1f, r, rCtx)[f],
    (f-0, (apply(Concat(n, E1f, E1s), r, rCtx))[0, n])::(Offset(0, n), apply(Concat(n, E1f, E1s), r, rCtx))::apply(ECtx, r, rCtx))
] ++n apply(E1s, r, rCtx)[
  (g - n) ->
  apply(
  mapUpHere(E2p, g, Offset(n), Up(g)),
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
        for(let k in secondAction.childEditActions) {
          k = Number(k);
          if(k < firstAction.count) {
            leftChildren[k] = mapUpHere(secondAction.childEditActions[k], k, Offset(0, firstAction.count), Up(k));
          } else {
            rightChildren[k - firstAction.count] = mapUpHere(secondAction.childEditActions[k], k, Offset(firstAction.count), Up(k));
          }
        }
        
        if(editActions.__debug) {
          console.log("Inside left of Concat(" + firstAction.count, ", |, ...)");
        }
        let newFirst = recurse(Reuse(leftChildren), firstAction.first, AddContext(Offset(0, firstAction.count), firstAction, firstActionContext));
        if(editActions.__debug) {
          console.log("Inside right of Concat(" + firstAction.count, ", ..., |)");
        }
        let newSecond = recurse(Reuse(rightChildren), firstAction.second, AddContext(Offset(firstAction.count), firstAction, firstActionContext));
        
        return Concat(firstAction.count, newFirst, newSecond)
      } else {
        // Anything else, we could use Custom.
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
        // Actually, it seems that we just did a Custom with the semantics of Sequence.
        // Sequence(E1, E2, ECtx)
        // = Custom(E1, ((x, r, rCtx) => apply(E2, x, apply(ECtx, rrCtx)), ?))
        return Custom(firstAction, (x, r, rCtx) => apply(secondAction, x, apply(ECtx, r, rCtx)), undefined);
      }
      //throw "Implement me - andThen second Reuse"
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
        newChildren[g] = recurse(secondAction.childEditActions[g], firstAction, firstActionContext);
      }
      if(isSecondRaw) { // We keep the raw nature of the edit action, e.g. if this is a context
        if(typeof secondAction.model == "object") {
          return newChildren;
        } else {
          return secondAction.model;
        }
      } else {
        return New(newChildren, secondAction.model);
      }
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
    return Sequence(firstAction, secondAction, firstActionContext);
  }
  editActions.andThen = andThenWithLog//andThen;
  
  function actionContextToString(ECtx) {
    return List.toArray(ECtx).map(elem => "("+ keyOrOffsetToString(elem.keyOrOffset) + ", " + stringOf(elem.action) + ", " + stringOf(elem.relativePath)+ ")").join("\n")
  }
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
        offsetAt(newDownOffset, newFirstAction), 
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
  function walkDownActionCtx(keyOrOffset, E1, ECtx) {
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
      newAction = offsetAt(keyOrOffset, E1);
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
    switch(editAction.ctor) {
    case Type.Reuse:
      /** Proof
         apply(downAt(f, Reuse({f: E1}), r, rCtx)
         = apply(Down(f, E1), r, rCtx)
         = apply(E1, x, (f, r)::rCtx)
         = {...f: apply(E1, x, (f, r)::rCtx)...}[f]
         = apply(Reuse({f: E1}), {...f: x...}, rCtx)[f]
         QED
      */
      return Down(key, editAction.childEditActions[key] || Reuse());
    case Type.New:
      /** Proof:
        apply(downAt(f, New({f: E1}), r, rCtx)
        = apply(E1, r, rCtx)
        = {f: apply(E1, r, rCtx)}[f]
        = apply(New({f: E1}), r, rCtx)[f]
      */
      return editAction.childEditActions[key] || New(undefined);
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
  function mapChildren(object, callback, canReuse = true) {
    let o = {};
    let same = canReuse;
    for(let k in object) {
      let newOk = callback(k, object[k]);
      same = same && newOk == object[k];
      o[k] = newOk;
    }
    if(same) return object;
    return o;
  }
  
  // if [left, right] = splitAt(count, editAction)
  // Then
  //
  // apply(left, r, rCtx) ++count apply(right, r, rCtx))
  // = apply(editAction, r, rCtx);
  function splitAt(count, editAction) {
    if(editActions.__debug) {
      console.log("splitAt(", count, "," , stringOf(editAction), ")")
    }
    if(count == 0) {
      /**
      Proof:
        applyZ(Down(Offset(0, 0)), rrCtx) ++0 applyZ(editAction, rrCtx)
        = applyZ(editAction, rrCtx)
      */
      return [Down(Offset(0, 0)), editAction];
    }
    var left, right;
    switch(editAction.ctor) {
    case Type.Reuse: {
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
        
        Proof if using mapUpHere (which is nice because it does not insert unnecessary Ups and Downs)
        
        Proof: (f < n, g >= n)
        editAction: Reuse({f: Ef, g: Eg})
        left: Down(Offset(0, n), Reuse({f: mapUpHere(Ef, f, Offset(0, n), Up(k)) }))
        right: Down(Offset(n), Reuse({(g-n): mapUpHere(Eg, f, Offset(n), Up(k))}))
        r = {...f: x...g: y...}
        
        apply(left, r, rCtx) ++n apply(right, r, rCtx))
        = apply(Down(Offset(0, n), Reuse({f: mapUpHere(Ef, f, Offset(0, n), Up(k)) })), r, rCtx) ++n
          apply(Down(Offset(n), Reuse({(g-n): mapUpHere(Eg, f, Offset(n), Up(k))})), r, rCtx))
        = apply(Reuse({f: mapUpHere(Ef, f, Offset(0, n), Up(k)) }), r[0,n], (Offset(0, n), r)::rCtx) ++n
          apply(Reuse({(g-n): mapUpHere(Eg, f, Offset(n), Up(k))}), r[n...], (Offset(n), r)::rCtx))
        = r[0,n][f -> 
            apply(mapUpHere(Ef, f, Offset(0, n), Up(k)), r[f], (f, r[0,n])::(Offset(0, n), r)::rCtx)] ++n
          r[n...][g-n ->
            apply(mapUpHere(Eg, f, Offset(n), Up(k)),
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
      for(let k in editAction.childEditActions) {
        let f = Number(k), g = Number(k);
        if(f < count) {
          // I could also have done a mapUpHere there. What is the best?
          //left[f] = Up(f, Offset(0, count), Down(f, editAction.childEditActions[k]));
          left[k] = mapUpHere(editAction.childEditActions[k], k, Offset(0, count), Up(k)); 
        } else { // g >= count
          //right[g - count] = Up(g-count, Offset(count), Down(g, editAction.childEditActions[k]));
          right[g-count] = mapUpHere(editAction.childEditActions[k], k, Offset(count), Up(k));
        }
      }
      // left: Down(Offset(0, n), Reuse({f: Up(f, Offset(0, n), Down(f, Ef))}))
      // right: Down(Offset(n), Reuse({(g-n): Up(g-n, Offset(n), Down(g, Eg))}))
     
      return [Down(Offset(0, count), Reuse(left)), Down(Offset(count), Reuse(right))];
      }
    case Type.New:
      if(typeof editAction.model === "string") {
        /** Proof
          editAction = New("abcdnef");
          
          apply(New("abcdn"), r, rCtx) ++n apply(New("ef"), r, rCtx)
          = "abcdn" + "ef"
          = "abcdnef"
          = apply(editAction, r, rCtx)
        */
        return [New(editAction.model.substring(0, count)), New(editAction.model.substring(count))];
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
        for(let k in editAction.childEditActions) {
          let f = Number(k), g = f;
          if(f < count) {
            left[f] = editAction.childEditActions[f];
          } else {
            right[g - count] = editAction.childEditActions[g];
          }
        }
        // Proof: editAction = New({fi = ei}i, [])
        //                   = Concat(count, Down(Offset(0, count), New({fi = ei, if fi < count}i)), Down(Offset(count), New({(fi-count) = ei, if fi >= count})))
        return [New(left, editAction.model), New(right, editAction.model)];
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
        let [left1, right1] = splitAt(count, editAction.first);
        return [
          left1,
          Concat(editAction.count - count, right1, editAction.second)
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
        let [left, right] = splitAt(count - editAction.count, editAction.second);
        return [
          Concat(editAction.count, editAction.first, left),
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
        let [left, right] = splitAt(count, editAction.subAction);
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
        let [left, right] = splitAt(count, editAction.subAction);
        return [Up(o, left), Up(o,right)];
      }
    case Type.Down:
       if(isOffset(editAction.keyOrOffset)) {
        /** Proof: Identical to Type.Up but in reverse */
        let o = editAction.keyOrOffset;
        let [left, right] = splitAt(count, editAction.subAction);
        return [Down(o, left), Down(o, right)];
        
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
        let [left, right] = splitAt(count, editAction.subAction);
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
  
  applyOffset(offset, apply(editAction, r, rCtx)
  = apply(rightFirst1, r, rCtx)
  = apply(offsetAt(offset, editAction), r, rCtx)
  QED
  */
  // apply(offsetAt(offset, EX), r, rCtx)
  // = applyOffset(offset, apply(EX, r, rCtx))
  function offsetAt(newOffset, editAction) {
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
    let [leftFirst, rightFirst] = splitAt(newOffset.count, editAction);
    if(editActions.__debug) console.log("splitting")
    if(newOffset.newLength !== undefined) {
      let [rightFirst1, rightFirst2] = splitAt(newOffset.newLength, rightFirst);
      return rightFirst1;
    } else {
      return rightFirst;
    }
  }
  editActions.offsetAt = offsetAt;
  
  // Returns true if the edit action is anyhow reusing something below where it is applied
  function isReusingBelow(editAction) {
    return editAction.ctor == Type.Reuse ||
           editAction.ctor == Type.Down && isReusingBelow(editAction.subAction) ||
           editAction.ctor == Type.Concat && (isReusingBelow(editAction.first) || isReusingBelow(editAction.second)) ||
           editAction.ctor == Type.New && 
           Object.keys(editAction.childEditActions).findIndex(k => isReusingBelow(editAction.childEditActions[k])) >= 0 ||
           editAction.ctor == Type.Custom &&
           isReusingBelow(editAction.subAction);
  }
  // returns true if the edit action is never reusing anything from the input
  // New edit actions not wrapped are not considered final.
  function isFinal(editAction) {
    return isEditAction(editAction) && (
      editAction.ctor == Type.New && Object.keys(editAction.childEditActions).findIndex(k => !isFinal(editAction.childEditActions[k])) == -1 ||
      editAction.ctor == Type.Concat && isFinal(editAction.first) && isFinal(editAction.second) ||
    editAction.ctor == Type.Custom && isFinal(editAction.subAction) ||
    editAction.ctor == Type.Up && isFinal(editAction.subAction) ||
    editAction.ctor == Type.Down && isFinal(editAction.subAction));
  }
  editActions.isFinal = isFinal;
  
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
  
  // Given a bound on an input, try to find what the bound on the output of the edit action would be like.
  function adaptInBoundTo(editAction, position, isLeft) {
    let [inCount, outCount, first, second] = argumentsIfFork(editAction);
    if(editActions.__debug) {
      console.log("adaptInBoundTo"+(isLeft ? "Left" : "")+"("+stringOf(editAction)+", " + position);
    }
    if(second !== undefined) {
      if(position >= inCount) {
        return outCount + adaptInBoundTo(second, position - inCount, isLeft);
      } else {
        return adaptInBoundTo(first, position, isLeft);
      }
    }
    if(editAction.ctor == Type.New) {
      if(typeof isLeft == "boolean") {
        if(isLeft) return 0; // We take the entire New
        return lengthOfArray(editAction.childEditActions);
      }
      return position;
    }
    if(editAction.ctor == Type.Down && isOffset(editAction.keyOrOffset)) {
      return adaptInBoundTo(editAction.subAction, position-editAction.keyOrOffset.count, isLeft)
    }
    return position;
  }
  
  // Given an offset on an input, guess what the offset on the output would be like.
  function adaptInOffsetAt(editAction, offset) {
    let newCount = Math.max(0, adaptInBoundTo(editAction, offset.count, true));
    let newEnd = offset.newLength !== undefined ? adaptInBoundTo(editAction, offset.count + offset.newLength, false) : undefined;
    let newLength = MaxUndefined(0, MinusUndefined(newEnd, newCount));
    return Offset(newCount, newLength, offset.oldLength);
  }
  
  // assumes the input array is now restricted to the given offset. Will be prefixed a Down(offset, |) to the result;
  function restrictInput(offset, editAction) {
    if(editActions.__debug) console.log("restrictInput(", keyOrOffsetToString(offset), stringOf(editAction));
    let [inCount, outCount, first, second] = argumentsIfFork(editAction);
    if(second != undefined) {
      if(inCount <= offset.count) {
        return restrictInput(Offset(offset.count - inCount, offset.newLength, offset.oldLength), Down(Offset(inCount), second));
      } else if(offset.newLength !== undefined && offset.newLength + offset.count <= inCount) {
        return restrictInput(offset, Down(Offset(0, inCount), first));
      } else { // A bit on each side.
        // offset.count < inCount && inCount < offet.newLength + offset.count
        if(editActions.__debug) {
          console.log("Inside Fork(" + (inCount -offset.count) + ", |, ...)")
        }
        let newLeft = restrictInput(Offset(offset.count, inCount - offset.count), first);
        if(editActions.__debug) {
          console.log("Inside Fork(" + (inCount -offset.count) + ", "+stringOf(newLeft)+", |)")
        }
        let newRight = restrictInput(Offset(0, MinusUndefined(offset.newLength, (inCount - offset.count))), second);
        let lengthLeft = outLength(newLeft, inCount - offset.count);
        if(editActions.__debug) {
          console.log("returning Fork(" + (inCount -offset.count) + ", "+lengthLeft+", "+stringOf(newLeft)+", "+stringOf(newRight)+")")
        }
        return Fork(inCount - offset.count, lengthLeft,
          newLeft,
          newRight);
      }
    } else if(editAction.ctor == Type.Down) {
      if(isOffset(editAction.keyOrOffset)) {
        if(offset.newLength !== undefined && offset.count + offset.newLength <= editAction.keyOrOffset.count || editAction.keyOrOffset.newLength !== undefined && editAction.keyOrOffset.count + editAction.keyOrOffset.newLength <= offset.count) { // OK, nothing, in common, we just delete everything
          return Down(Offset(0, 0, editAction.keyOrOffset.oldLength));
        } else { // Intervals not disjoint.
          let newOffset = intersectOffsets(offset, editAction.keyOrOffset);
          if(editActions.__debug) console.log("newOffset", keyOrOffsetToString(newOffset))
          let newOffset1 = diffOffset(editAction.keyOrOffset, newOffset);
          if(editActions.__debug) console.log("newOffset1", keyOrOffsetToString(newOffset1))
          return restrictInput(newOffset1, editAction.subAction);
        }
      } else { // It's a key.
        return Up(offset, editAction);
      }
    } else if(editAction.ctor == Type.Reuse) {
      // Remove the useless keys.
      let o = {};
      for(let k in editAction.childEditActions) {
        if(Number(k) < offset.count || offset.newLength !== undefined && Number(k) >= offset.count + offset.newLength) {
          continue;
        }
        o[Number(k)-offset.count] = mapUpHere(editAction.childEditActions[k], k, offset, Up(k));
      }
      return Reuse(o);
    } else {
      return Up(offset, editAction);
    }
  }
  
  // Merge function, but with logs of outputs
  function addLogMerge(fun) {
    return function(E1, E2, multiple = false) {
      let res = fun(E1, E2, multiple);
      if(editActions.__debug) {
        console.log("  merge returns");
        console.log(addPadding("  " + stringOf(E1), "  "));
        console.log(addPadding("  " + stringOf(E2), "  "));
        console.log(addPadding("  =>" + stringOf(res), "  =>"));
      }
      return res;
    }
  }
  
  
  // Core of merge and back-propagate.
  // The specification is hard to elaborate, but the idea is that
  // applyZ(merge(E1, E2), (r, rCtx))
  // = three way merge of r, applyZ(E1, (r, rCtx)) and applyZ(E2, (r, rCtx));
  
  // Meaning of abbreviations:
  /*
    R: Reuse (R = R* U R0)
    R*: Reuse without identity
    N: New  (N = N* U N0)
    N*: New without primitive types (N* = Nr U Nc)
    Nr: New with reusing (wrapping)
    Nc: New without reusing directly (building from scratch)
    F: Fork
    C: Concat
    U: Up,
    D: Down,
    S: Sequence,
    UR: UseResult
  */
  // Action resulting if we applied E1 and E2 in parallel and merged the result.
  var merge = addLogMerge(function mergeRaw(E1, E2, multiple = false) {
    if(editActions.__debug) {
      console.log("merge");
      editActions.debug(E1);
      editActions.debug(E2);
    }
    if(E1.ctor == Type.Choose) {
      return Choose(...Collection.map(E1.subActions, x => merge(x, E2, multiple)));
    }
    if(E2.ctor == Type.Choose) {
      return Choose(...Collection.map(E2.subActions, x => merge(E1, x, multiple)));
    }
    let result = [];
    merge_cases: {
      // (E1, E2) is [R, N, F, C, U, D, UR] x [R, N, F, C, U, D, UR]
      if(isIdentity(E1)) {
        result.push(E2);
        break merge_cases;
      }
      // (E1, E2) is [R*, N, F, C, U, D, UR] x [R, N, F, C, U, D, UR]
      if(isIdentity(E2)) {
        result.push(E1);
        break merge_cases;
      }
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
        if(!isReusingBelow(E1) && !isReusingBelow(E2)) {
          result.push(E1);
          result.push(E2);
          break merge_cases;
        }
      }
      // (E1, E2) is [R*, N, F, C, U, D, UR] x [R*, N, F, C, U, D, UR] \ N0 x N0
      
      // We only merge children that have reuse in them. The other ones, we don't merge.
      if(E1.ctor == Type.New) {
        if(isReusingBelow(E1)) {
          printDebug("pushing #1")
          result.push(New(mapChildren(E1.childEditActions, (k, c) => isReusingBelow(c) ? merge(c, E2, multiple) : c), E1.model));
        }
      }
      if(E2.ctor == Type.New) {
        if(isReusingBelow(E2)) {
          printDebug("pushing #2")
          result.push(New(mapChildren(E2.childEditActions, (k, c) => isReusingBelow(c) ? merge(E1, c, multiple) : c), E2.model));
        }
      }
      if(E1.ctor == Type.New && !isReusingBelow(E1) && E2.ctor != Type.New || E2.ctor == Type.New && !isReusingBelow(E2) && E1.ctor != Type.New) {
        printDebug("pushing #3 and #4")
        result.push(E1);
        result.push(E2);
        break merge_cases;
      }
      if(E1.ctor == Type.New || E2.ctor == Type.New) {
        // The only way for nothing to have been pushed to result is to have:
        // E1.ctor == Type.New || E2.ctor == Type.New
        // && (E1.ctor != Type.New || E2.ctor != Type.New || isReusingBelow(E1) || isReusingBelow(E2))
        // && E1.ctor == Type.New ==> !isReusingBelow(E1)
        // && E2.ctor == Type.New ==> !isReusingBelow(E2)
        // = (a || b) && (!a || !b || c || d)
        // && (!a || !c) && (!b || !d)
        // && (!a || c || b)
        // && (!b || d || a)
        // Is it satisfiable now?
        // If a = true then c is false and b is true, so d is false, thus contradiction.
        // if a = false, then b is true, then d is false, then a is true. Contradiction.
        // Ok at this point, at least one case will have been pushed into result.
        break merge_cases;
      }
      // (E1, E2) is [R*, F, C, U, D, UR] x [R*, F, C, U, D, UR]      
      // Cases where we can merge because we are reusing
      if(E1.ctor == Type.Reuse && E2.ctor == Type.Reuse) {
        // Merge key by key.
        let o = mapChildren(E1.childEditActions, (k, c) => {
          if(k in E2.childEditActions) {
            return merge(c, E2.childEditActions[k], multiple);
          } else {
            return c;
          }
        }, /*canReuse*/false);
        for(let k in E2.childEditActions) {
          if(!(k in E1.childEditActions)) {
            o[k] = E2.childEditActions[k];
          }
        }
        result.push(Reuse(o));
      // (E1, E2) is [R*, F, C, U, D, UR] x [R*, F, C, U, D, UR] \ R* x R*
      } else if(E1.ctor == Type.Reuse && E2.ctor == Type.Concat) {
        let [inCount, outCount, left, right] = argumentsIfFork(E2);
        if(!right) { // This concat is an Insert, not a fork, no point merging first. We just merge second.
          let newSecond = merge(E1, E2.second, multiple);
          result.push(Concat(E2.count, E2.first, newSecond));
        } else { // This is a fork. Hence, we split E1 so that we can merge with each side. Careful: we need to call mapUpHere so that E1's paths are correct.
          let [left, right] = splitAt(inCount, E1);
          // E1 ~= Concat(outCount, left, right)
          // and left and right are supposed to be the same.
          let newFirst = merge(left, E2.first, multiple);
          let newSecond = merge(right, E2.second, multiple);
          result.push(Concat(E2.count, newFirst, newSecond));
        }
      // (E1, E2) is [R*, F, C, U, D, UR] x [R*, F, C, U, D, UR] \ R* x [R*, C]
      } else if(E2.ctor == Type.Reuse && E1.ctor == Type.Concat) {
        let [inCount, outCount, left, right] = argumentsIfFork(E1);
        if(!right) { // This concat is an Insert, not a fork, no point merging first. We just merge second.
          let newSecond = merge(E1.second, E2, multiple);
          result.push(Concat(E1.count, E1.first, newSecond));
        } else { // This is a fork. Hence, we split E1 so that we can merge with each side. Careful: we need to call mapUpHere so that E1's paths are correct.
          let [left, right] = splitAt(inCount, E2);
          // E1 ~= Concat(outCount, left, right)
          // and left and right are supposed to be the same.
          let newFirst = merge(E1.first, left, multiple);
          let newSecond = merge(E1.second, right, multiple);
          result.push(Concat(E1.count, newFirst, newSecond));
        }
      // (E1, E2) is [R*, F, C, U, D, UR] x [R*, F, C, U, D, UR] \ R* x [R*, C] \ C x R*
      } else if(E1.ctor == Type.Concat && E2.ctor == Type.Concat) {
        // (E1, E2)  is  F x F  U  F x C  U  C x F  U  C x C
        let [inCount1, outCount1, left1, right1] = argumentsIfFork(E1);
        let [inCount2, outCount2, left2, right2] = argumentsIfFork(E2);
        if(right1 && right2) {
          if(inCount1 == 0 && outCount1 > 0) { // First is an insertion
            result.push(Insert(outCount1, left1, merge(right1, E2, multiple)));
          }
          if(inCount2 == 0 && outCount2 > 0) { // Second is an insertion
            result.push(Insert(outCount2, left2, merge(E1, right2, multiple)));
          }
          if((inCount1 == 0 && outCount1 > 0) || (inCount2 == 0 && outCount2 > 0)) {
            break merge_cases; // We are done with insertions.
          }
          if(outCount1 == 0 && outCount2 == 0 && inCount1 > 0 && inCount2 > 0) {
            // Two deletes. We factor out the smaller delete and continue.
            let minDelete = Math.min(inCount1, inCount2);
            result.push(Delete(minDelete, merge(
              inCount1 == minDelete ? right1 : Delete(inCount1 - minDelete, right1),
              inCount2 == minDelete ? right2 : Delete(inCount2 - minDelete, right2),
              multiple
            )));
          // Ok, two reuse of arrays, we just align them and merge them. We need to adjust where to split
          } else if(inCount1 == inCount2) {
            newLeft = merge(left1, left2, multiple);
            newLeftCount = MinUndefined(outLength(newLeft, inCount1), outCount1 +outCount2);
            result.push(Fork(inCount1, newLeftCount, newLeft, merge(right1, right2, multiple)));

          } else if(inCount1 < inCount2) {
          // It might be better to choose where to split the first if the left has a Reuse() that we can split, or the second.
          // But usually, the biggest first action indicates a Reuse of it.
            // [ inCount1   ][     .... ]
            // [  inCount2   |   ] [.....]
            if(editActions.__debug) console.log("inCount1 = ", inCount1);
            let newE2Left = restrictInput(Offset(0, inCount1), E2);
            let newE2Right = restrictInput(Offset(inCount1), E2);
            let leftPart = merge(
              left1, newE2Left, multiple)
            let rightPart = merge(
              right1, newE2Right, multiple)
            let newLeftCount = MinUndefined(outCount1, outLength(leftPart));
            result.push(Concat(newLeftCount, Down(Offset(0, inCount1), leftPart), Down(Offset(inCount1), rightPart)));
            /*
            let newOutPosition = Math.max(0, adaptInBoundTo(E2, inCount1));
            if(editActions.__debug) console.log("newOutPosition = ", stringOf(newOutPosition));
            let [left21, left22] = splitAt(newOutPosition, Down(Offset(0, inCount2), left2));
            // left2 = Concat(, left21, left22)
            if(editActions.__debug) console.log("left21 = ", stringOf(left21));
            if(editActions.__debug) console.log("left22 = ", stringOf(left22)); 
            
            let leftPart = merge(
              Down(Offset(0, inCount1), left1),
              left21, multiple);
            
            let rightPart = merge(
              Down(Offset(inCount1), right1),
              Down(Offset(inCount1), Concat(outCount2-newOutPosition,
                Up(Offset(inCount1), left22),
                Up(Offset(inCount1), Down(Offset(inCount2), right2)))),
              multiple);
            let newLeftCount = MinUndefined(outCount1, outLength(leftPart));
            result.push(Concat(newLeftCount, leftPart, rightPart));
            */
          } else { // inCount1 > inCount2
            // [  inCount1   |   ] [.....]
            // [  inCount2   ][     .... ]
            if(editActions.__debug) console.log("inCount2 = ", inCount2);
            let newOutPosition = Math.max(0, adaptInBoundTo(E1, inCount2));
            if(editActions.__debug) console.log("newOutPosition = ", stringOf(newOutPosition));
            let [left11, left12] = splitAt(newOutPosition, Down(Offset(0, inCount1), left1));
            // left1 = Concat(, left11, left12)
            if(editActions.__debug) console.log("left11 = ", stringOf(left11));
            if(editActions.__debug) console.log("left12 = ", stringOf(left12)); 
            
            let leftPart = merge(
              left11,
              Down(Offset(0, inCount2), left2),
              multiple);
            
            let rightPart = merge(
              Down(Offset(inCount2), Concat(outCount1-newOutPosition,
                Up(Offset(inCount2), left12),
                Up(Offset(inCount2), Down(Offset(inCount1), right1)))),
              Down(Offset(inCount2), right2), multiple);
            let newLeftCount = MinUndefined(outCount2, outLength(leftPart));
            result.push(Concat(newLeftCount, leftPart, rightPart));
          }
        } else {
          result.push(E1);
          result.push(E2);
        }
        // (E1, E2)  is  F x C  U  C x F  U  C x C
        
      // (E1, E2) is [R*, F, C, U, D, UR] x [R*, F, C, U, D, UR] \ [R*, C] x [R*, C]
      } else if((E1.ctor == Type.Reuse || isFork(E1)) && E2.ctor == Type.Down) {
        let ko = E2.keyOrOffset;
        if(isOffset(ko)) {
          ko = adaptInOffsetAt(E1, ko);
          let newE1 = offsetAt(ko, E1);
          result.push(merge(newE1, E2.subAction, multiple));
        } else {
          ko = adaptInBoundTo(E1, ko);
          let newE1 = downAt(ko, E1);
          result.push(merge(newE1, E2.subAction, multiple));
        }
      // (E1, E2) is [R*, F, C, U, D, UR] x [R*, F, C, U, D, UR] \ [R*, C] x [R*, C] \ [R*, F] x D
      } else if((E2.ctor == Type.Reuse || isFork(E2)) && E1.ctor == Type.Down) {
        let ko = E1.keyOrOffset;
        if(isOffset(ko)) {
          ko = adaptInOffsetAt(E2, ko);
          let newE2 = offsetAt(ko, E2);
          result.push(merge(E1.subAction, newE2, multiple));
        } else {
          ko = adaptInBoundTo(E2, ko);
          let newE2 = downAt(ko, E2);
          result.push(merge(E1.subAction, newE2, multiple));
        }
      // (E1, E2) is [R*, F, C, U, D, UR] x [R*, F, C, U, D, UR] \ [R*, C] x [R*, C] \ [R*, F] x D \ D x [R*, F]

      // Beyond this point, there are changes immediately made to the tree.
      } else if(E1.ctor == Type.Up && E2.ctor == Type.Up && keyOrOffsetAreEqual(E1.keyOrOffset, E2.keyOrOffset)) {
        result.push(Up(E1.keyOrOffset, merge(E1.subAction, E2.subAction, multiple)));
      
      // (E1, E2) is [R*, F, C, U, D, UR] x [R*, F, C, U, D, UR] \ [R*, C] x [R*, C] \ [R*, F] x D \ D x [R*, F] \ U x U
      } else if(E1.ctor == Type.Up && (isFork(E2) || E2.ctor == Type.Reuse)) {
        // We just dismiss E2
        result.push(E1);
      } else if(E2.ctor == Type.Up && (isFork(E1) || E1.ctor == Type.Reuse)) {
        // We just dismiss E1
        result.push(E2);
      } else if(E1.ctor == Type.Down && E2.ctor == Type.Down) {
        if(keyOrOffsetAreEqual(E1.keyOrOffset, E2.keyOrOffset)) {
          result.push(Down(E1.keyOrOffset, merge(E1.subAction, E2.subAction, multiple)));
        } else if(isOffset(E1.keyOrOffset) && isOffset(E2.keyOrOffset)) {
          // E1.keyOrOffset.oldLength == E2.keyOrOffset.oldLength 
          if(E2.keyOrOffset.count < E1.keyOrOffset.count && E2.keyOrOffset.count > 0) {
            //   [c2       c2+n2]
            //       [c1,     c1+n1]
            //   [c2         c2+n2]
            //       [c1,  c1+n1]
            // The idea is to first factor out Down(c2)
            // We merge the common deletions so that at least one pops up the Down
            // 
            // Down(O(c1, n1, o))
            // = Down(O(c2, o, o), O(c1-c2, n1, o-c2)
            // Down(O(c2, n2, o))
            // = Down(O(c2, o, o), O(0, n2, o - c2))
            result.push(
              Down(
                Offset(E2.keyOrOffset.count,
                  E2.keyOrOffset.oldLength,
                  E2.keyOrOffset.oldLength
                ),
              merge(
                Down(
                  Offset(
                    E1.keyOrOffset.count - E2.keyOrOffset.count,
                    E1.keyOrOffset.newLength, MinusUndefined(E1.keyOrOffset.oldLength, E2.keyOrOffset.count)), E1.subAction),
                Down(
                  Offset(0, E2.keyOrOffset.newLength, MinusUndefined(E2.keyOrOffset.oldLength, E2.keyOrOffset.count)), E2.subAction),
                multiple))
            );
          } else if(E1.keyOrOffset.count < E2.keyOrOffset.count && E1.keyOrOffset.count > 0) {
            result.push(
              Down(
                Offset(E1.keyOrOffset.count,
                  E1.keyOrOffset.oldLength,
                  E1.keyOrOffset.oldLength
                ),
              merge(
                Down(
                  Offset(0, E1.keyOrOffset.newLength, MinusUndefined(E1.keyOrOffset.oldLength, E1.keyOrOffset.count)), E1.subAction),
                Down(
                  Offset(
                    E2.keyOrOffset.count - E1.keyOrOffset.count,
                    E2.keyOrOffset.newLength, MinusUndefined(E2.keyOrOffset.oldLength, E1.keyOrOffset.count)), E2.subAction),
                multiple))
            );
          } else {
            // Now at least one offset starts at zero.
            // [0,    n1]
            //    [c2, c2+n2]
            // etc.
            // We take the intersection of the two offsets. TODO: This is wrong. We take an offsetAt assuming newOffset1 on the output, not the input.
            let newOffset = intersectOffsets(E1.keyOrOffset, E2.keyOrOffset);
            if(editActions.__debug) {
              console.log("newOffset:"+keyOrOffsetToString(newOffset))
            }
            if(newOffset.newLength <= 0) {
              result.push(Down(newOffset));
            } else if(false) {
              
              // We take the offset relative to the previous offsets.
              let newOffset1 = diffOffset(E1.keyOrOffset, newOffset);
              let newOffset2 = diffOffset(E2.keyOrOffset, newOffset);
              if(editActions.__debug) {
                console.log("newOffset1:"+keyOrOffsetToString(newOffset1))
                console.log("newOffset2:"+keyOrOffsetToString(newOffset2))
              }
              //newOffset1 = adaptInOffsetAt(E1.subAction, newOffset1);
              //newOffset2 = adaptInOffsetAt(E2.subAction, newOffset2);
              if(editActions.__debug) {
                console.log("Adapted newOffset1:"+keyOrOffsetToString(newOffset1))
                console.log("Adapted newOffset2:"+keyOrOffsetToString(newOffset2))
              }
              let newE1 = restrictInput(newOffset1, E1);
              let newE2 = restrictInput(newOffset2, E2);
              result.push(merge(newE1, newE2, multiple));
            } else {
              result.push(Down(newOffset, merge(restrictInput(newOffset, E1), restrictInput(newOffset, E2), multiple)))
            }
          }
        } else {
          result.push(E1);
          result.push(E2);
        }
        // (E1, E2) is [R*, F, C, U, D, UR] x [R*, F, C, U, D, UR] \ [R*, F, C] x [R*, F, C] \ [R*, F, D] x [R*, F, D] \ U x U
      } else if(isInsert(E1)) {
        result.push(Concat(E1.count, E1.first, merge(E1.second, E2, multiple)));
      } else if(isInsert(E2)) {
        result.push(Concat(E2.count, E2.first, merge(E1, E2.second, multiple)));
      } else {
        result.push(E1);
        result.push(E2);
      }
      
      /*
      if(E1.ctor == Type.Concat) {
        // We test if it's a Fork
        // TODO: Merge continue here
        
        let firstOfDiff1 = Collection.onlyElemOrDefault(E1.first);
        if(firstOfDiff1 && firstOfDiff1.ctor == Type.New) {
          let mergeSecond = merge2DDiffs(E1.second, E2);
          result.push(insertLeftWhenSameLeftBound(mergeSecond, E1.second, E1.first));
          continue;
        }
        let secondOfDiff1 = Collection.onlyElemOrDefault(E1.second);
        if(secondOfDiff1 && secondOfDiff1.ctor == Type.New) {
          let mergeFirst = merge2DDiffs(E1.first, E2);
          result.push(insertRightWhenSameRightBound(mergeFirst, E1.first, E1.second));
          continue;
        }
      }
      if(E2.ctor == Type.Insert) {
        let firstOfDiff2 = Collection.onlyElemOrDefault(E2.first);
        if(firstOfDiff2 && firstOfDiff2.ctor == Type.New) {
          let mergeSecond = merge2DDiffs(E1, E2.second);
          result.push(insertLeftWhenSameLeftBound(mergeSecond, E2.second, E2.first));
          continue;
        }
        let secondOfDiff2 = Collection.onlyElemOrDefault(E2.second);
        if(secondOfDiff2 && secondOfDiff2.ctor == Type.New) {
          let mergeFirst = merge2DDiffs(E1, E2.first);
          result.push(insertRightWhenSameRightBound(mergeFirst, E2.first, E2.second));
          continue;
        }
      }
      if(E1.ctor == Type.Insert) {
          let newFirst = merge2DDiffs(E1.first, E2);
          let newSecond = merge2DDiffs(E1.second, E2);
          let newCount = outLength(newFirst) || E1.count;
          result.push(Insert(newCount, newFirst, newSecond));
      }
      if(E2.ctor == Type.Insert) {
          let newFirst = merge2DDiffs(E1, E2.first);
          let newSecond = merge2DDiffs(E1, E2.second);
          let newCount = outLength(newFirst) || E2.count;
          result.push(Insert(newCount, newFirst, newSecond));
      }
      if(E1.ctor == Type.Insert || E2.ctor == Type.Insert) {
        continue;
      }
      if(E1.ctor == Type.Reuse) {
        let [relPath1, s1] = splitLastRemove(E1.path);
        if(E2.ctor == Type.Reuse) {
          let [relPath2, s2] = splitLastRemove(E2.path);
          if(pathInfoToString(relPath1) == pathInfoToString(relPath2)) { // Clone the same thing.
            // Merge removals, and shift keys of sub edit actions accordingly.
            // For each key, we want to find 1) the absolute key in the original array, 2) The relative key in the second array.
            let finalChildEditActions = {};
            let finalStrict = s1 && s2 ? s1.strict || s2.strict : s1 ? s1.strict : s2 ? s2.strict : false;
            let finalRemove = s1 && s2 ? Remove.portions.merge(s1.portions, s2.portions, finalStrict) : s1 ? s1.portions : s2 ? s2.portions : undefined;
            if(editActions.__debug) {
              console.log("s1 portions: ", s1 ? s1.portions : undefined);
              console.log("s2 portions: ", s2 ? s2.portions : undefined);
              console.log("final portions: ", finalRemove);
              console.log("final strict", finalStrict);
            }
            let step = 0;
            while(true) { // Let's do this for E1 and E2.
              let iFR = 0;
              let i1 = 0;
              let portions = s1 ? s1.portions : undefined;
              let fromK1ToAbs = 0;
              let fromAbsToFinalK = 0;
              let lastK1 = 0;
              let i2 = 0;
              let portions2 = s2 ? s2.portions : undefined;
              let fromAbsToK2 = 0;
              for(let k1 in E1.childEditActions) {
                if(portions) {
                  while(i1 < portions.length && Number(k1) + fromK1ToAbs >= portions[i1]) {
                    if(i1 + 1 < portions.length) {
                      fromK1ToAbs += portions[i1 + 1] - portions[i1];
                    }
                    i1 += 2;
                  }
                }
                let kAbs = portions ? Number(k1) + fromK1ToAbs : k1;
                if(editActions.__debug) {
                  console.log("k1", k1, "kAbs", kAbs);
                }
                if(finalRemove) {
                  while(iFR < finalRemove.length && Number(kAbs) >= finalRemove[iFR]) {
                    if(editActions.__debug) console.log("iFR", iFR, "fromAbsToFinalK", fromAbsToFinalK);
                    if(iFR+1 < finalRemove.length) {
                      fromAbsToFinalK -= finalRemove[iFR + 1] - finalRemove[iFR];
                    } else {
                      fromAbsToFinalK = undefined; // We should disregard this element.
                    }
                    iFR += 2;
                  }
                  if(editActions.__debug) console.log("iFR", iFR, "fromAbsToFinalK", fromAbsToFinalK);
                }
                if(portions2) {
                  while(i2 < portions2.length && Number(kAbs) >= portions2[i2]) {
                    if(editActions.__debug) console.log("i2", i2, "fromAbsToK2", fromAbsToK2);
                    if(i2+1 < portions2.length) {
                      fromAbsToK2 -= portions2[i2 + 1] - portions2[i2];
                    } else {
                      fromAbsToK2 = undefined; // We should disregard this element.
                    }
                    i2 += 2;
                  }
                  if(editActions.__debug) console.log("i2", i2, "fromAbsToK2", fromAbsToK2);
                }
                
                let finalK = finalRemove !== undefined ? kAbs + fromAbsToFinalK : kAbs;
                if(fromAbsToFinalK === undefined || finalK < 0) {
                  continue;
                }
                let k2 = portions2 !== undefined ? kAbs + fromAbsToK2 : kAbs;
                if(editActions.__debug) {
                  console.log("finalK", finalK, "k2", k2);
                }
                if(step == 0 && fromAbsToK2 !== undefined && k2 in E2.childEditActions) {
                  finalChildEditActions[finalK] = merge2DDiffs(E1.childEditActions[k1], E2.childEditActions[k2]);
                } else {
                  finalChildEditActions[finalK] = E1.childEditActions[k1];
                }
              }
              if(step == 0) {
                // Ok, so now let's revert the role of E1 and E2
                if(editActions.__debug) console.log("merging on the other way.")
                let tmp = E1; E1 = E2; E2 = tmp;
                tmp = s1; s1 = s2; s2 = tmp;
                step++;
              } else {
                break;
              }
            }
            result.push(Reuse(relPath1, finalRemove ? Remove(finalRemove, finalStrict) : undefined, finalChildEditActions));
            continue;
          }
        } else if(E1.ctor == Type.Fork && E2.ctor == Type.Fork) {
          if(E1.count == E2.count) {
            if(E1.count == 0) { // Pure insertions, they can 
              let nextActionMerged = merge2DDiffs(E1.nextAction, E2.nextAction);
              result.push(Fork(0, E1.subAction, 0, E2.subAction, nextActionMerged));
              if(E1.toString() != E2.toString()) {
                result.push(Fork(0, E2.subAction, 0, E1.subAction, nextActionMerged));
              }
            } else {
              result.push(Fork(E1.count, merge2DDiffs(E1.subAction, E2.subAction), merge2DDiffs(E1.nextAction, E2.nextAction)))
            }
          } else if(E1.count < E2.count) {
            if(E1.count === 0) { // Insertion
              result.push(Fork(E1.count, E1.subAction, merge2DDiffs(E1.nextAction, E2)));
            } else if(E2.subAction.ctor == Type.New && (
                            (Array.isArray(E2.subAction.model) && lengthOfArray(E2.subAction.childEditActions) == 0) || 
                            (typeof E2.subAction.model == "string" && E2.subAction.model.length == 0))) { // deletion.
              result.push(Fork(E1.count, E2.subAction, merge2DDiffs(E1.nextAction, Fork(E2.count - E1.count, E2.subAction, E2.nextAction))));
            } else if(isDSame(E2.subAction)) { // Replacement while other identity
              result.push(Fork(E1.count, E1.subAction, merge2DDiffs(E1.nextAction, Fork(E2.count - E1.count, E2.subAction, E2.nextAction))));
            } else {
              let [diff2Left, diff2Right] = splitArrayActionAt(E1.count, E2.subAction);
              result.push(Fork(E1.count,
                merge2DDiffs(E1.subAction, diff2Left),
                merge2DDiffs(E1.nextAction, Fork(E2.count - E1.count, diff2Right, E2.nextAction))))
            }
          } else { // E2.count < E1.count
            if(E2.count === 0) { // Insertion
              result.push(Fork(E2.count, E2.subAction, merge2DDiffs(E1, E2.nextAction)));
            } else if(E1.subAction.ctor == Type.New && (
                            (Array.isArray(E1.subAction.model) && lengthOfArray(E1.subAction.childEditActions) == 0) || 
                            (typeof E1.subAction.model == "string" && E1.subAction.model.length == 0))) { // deletion.
              result.push(Fork(E2.count, E1.subAction, merge2DDiffs(Fork(E1.count - E2.count, E1.subAction, E1.nextAction), E2.nextAction)));
            } else if(isDSame(E1.subAction)) { // Replacement while other identity
              result.push(Fork(E2.count, E2.subAction, merge2DDiffs(Fork(E1.count - E2.count, E1.subAction, E1.nextAction), E2.nextAction)));
            } else {
              let [diff1Left, diff1Right] = splitArrayActionAt(E2.count, E1.subAction);
              result.push(Fork(E2.count,
                merge2DDiffs(diff1Left, E2.subAction),
                merge2DDiffs(Fork(E1.count - E2.count, diff1Right, E1.nextAction), E2.nextAction)))
            }
          }
        }
      } else {
        result.push(E1);
        result.push(E2);
      }*/
    }
    return Choose(...result);
    if(multiple) {
      return Choose(...result);
    } else {
      if(result.length === 0) {
        console.log("Problem merging two edit actions, got empty result");
        debug(E1);
        debug(E2);
        console.log("returning second only");
        return E2;
      }
      return result[0];
    }
  });
  editActions.merge = merge;
  /**/
  
  // ReuseUp(Up("a", Up("b")), New(1))
  // = Reuse({b: Reuse({a: New(1)})})
  function ReuseUp(initUp, action) {
    let finalUp = initUp;
    while(!isIdentity(finalUp)) {
      if(editActions.__debug) {
        console.log("ReuseUp goes up " + keyOrOffsetToString(finalUp.keyOrOffset) + " on " + stringOf(action));
      }
      action = ReuseKeyOrOffset(finalUp.keyOrOffset, action);
      finalUp = finalUp.subAction;
    }
    return action;
  }
  
  function ActionContextWithInitUp(ECtx = undefined, initUp = Reuse()) {
    return {ctx: ECtx, initUp: initUp};
  }
  
  /* Returns [e', subs, initUp] where
     e' is an edit built from U suitable to apply onthe entire array.
     subs are the sub back-propagation problems to solve and merge to the final result
     initUp is the path to apply ReuseUp on
     */
  function partitionEdit(E, U, ECtx) {
    if(editActions.__debug) {
      console.log("partitionEdit");
      console.log("  "+addPadding(stringOf(E), "  "));
      console.log("<="+addPadding(stringOf(U), "  "));
      console.log("-|"+addPadding(stringOf(ECtx), "  "));
    }
    if(U.ctor == Type.Reuse) {
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
      return [New(o, U.model), next, ECtx];
    }
    if(U.ctor == Type.Down) {
      let [E1p, E1Ctxp] = walkDownActionCtx(U.keyOrOffset, E, ECtx);
      if(editActions.__debug) {
        console.log("After walking down " + keyOrOffsetToString(U.keyOrOffset) + ", we get "+stringOf(E1p));
        console.log("E1Ctxp: "+actionContextToString(E1Ctxp));
      }
      return partitionEdit(E1p,  U.subAction,  E1Ctxp, ECtx);
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
    if(U.ctor == Type.Concat) {
      // Even forks, we treat them like Concat when we try to resolve partitionEdit. At this point, we are already creating something new from old pieces.
      /*let [inCount, outCount, left, right] = argumentsIfFork(U);
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
      
      return [Concat(U.count, F1, F2), next1.concat(next2), ECtx];
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
      let o = {};
      for(let k in E.childEditActions) {
        o[k] = buildingPartOf(E.childEditActions[k]);
      }
      return New(o, E.model);
    }
    if(E.ctor == Type.Reuse) {
      return Reuse(); // Since we are reusing, we dont back-propagate evaluation edits.
    }
    if(E.ctor == Type.Concat) {
      let left = buildingPartOf(E.first);
      let right = buildingPartOf(E.second);
      return Concat(E.count, left, right)
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
  function prefixReuse(ctx, editAction) {
    // First, build a path out of all the relative paths
    // Then, apply this path
    return ReuseUp(pathAt(ctx), editAction);;
  }
  
  function backPropagate(E, U, ECtx = undefined) {
    if(editActions.__debug) {
      console.log("backPropagate");
      console.log("  "+addPadding(stringOf(E), "  "));
      console.log("<="+addPadding(stringOf(U), "  "));
      console.log("-|"+addPadding(stringOf(ECtx), "  "));
    }
    // We remove downs and ups to make them part of the context.
    if(E.ctor == Type.Down) {
      return backPropagate(E.subAction, U, Up(E.keyOrOffset, ECtx));
    }
    if(E.ctor == Type.Up) {
      return backPropagate(E.subAction, U, Down(E.keyOrOffset, ECtx))
    }
    if(U.ctor == Type.Choose && (E.ctor != Type.Custom || !E.lens.single)) {
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
        let newU = E.lens.update(U, E.lens.cachedInput, E.lens.cachedOutput);
        return backPropagate(E.subAction, newU, ECtx);
      } else {
        return E.lens.backPropagate(backPropagate, U, E.lens.cachedInput, E.lens.cachedOutput, E.subAction, ECtx);
      }
    }
    if(U.ctor == Type.Choose) {
      return Choose(...Collection.map(U.subActions, childU => backPropagate(E, childU, ECtx)));
    }
    if(U.ctor == Type.Reuse) {
      let result = Reuse();
      for(let k in U.childEditActions) {
        let [Ep, ECtxp] = walkDownActionCtx(k, E, ECtx);
        let tmp = backPropagate(Ep, U.childEditActions[k], ECtxp);
        result = merge(result, tmp);
      }
      return result;
    }
    // A hybrid possiblity is to have a first-level Down(Offset(m, n, o), R) where either o is known, or the edit action is a Concat, i.e. we are in a Fork. In this case, we want to remove [0, m] and [n, ...], and continue back-propagating in R, but not treat Forks are actions to rebuild something.
    if(U.ctor == Type.Down && isOffset(U.keyOrOffset) && (U.keyOrOffset.oldLength !== undefined || E.ctor == Type.Concat)) {
      let newU = U.subAction;
      let did = false; 
      if(U.keyOrOffset.newLength !== undefined && U.keyOrOffset.newLength > 0) {
        //console.log("newLength rewrite");  
        let o = outLength(U.subAction, U.keyOrOffset.newLength);
        if(o !== undefined) {
          newU = Fork(U.keyOrOffset.newLength, o, U.subAction, Down(Offset(0, 0)));
          did = true;
        }
      }
      if(U.keyOrOffset.count > 0) {
        newU = Fork(U.keyOrOffset.count, 0, Down(Offset(0, 0)), newU);
        did = true;
      }
      if(did) {
        U = newU;
        if(editActions.__debug) {
          console.log("Rewritten user action to \n"+stringOf(U));
        }
      } else { // (U.keyOrOffset.newLength == undefined || U.keyOrOffset.newLength == 0) && U.keyOrOffset.count  == 0
        // and since Offset(0, undefined) are removed, we can expect newLength to be zero.
        // In this particular case, if E is a Fork, we split the deletion to both sides as well.
        if(U.keyOrOffset.newLength === 0 && E.ctor == Type.Concat) {
          U = Fork(E.count, 0, Down(Offset(0, 0, E.count)), Down(Offset(0, 0, MinUndefined(U.keyOrOffset.oldLength, E.count))));
          if(editActions.__debug) {
            console.log("Rewritten user action from Down to \n"+stringOf(U));
          }
        }
      }
    }
    let [inCount, outCount, left, right] = argumentsIfFork(U);
    if(right !== undefined) {
      let [inCountE, outCountE, leftE, rightE] = argumentsIfFork(E);
      if(rightE !== undefined && outCountE == 0) {
        // Whatever the fork of the user, it does not touch the left portion.
        return backPropagate(E.second, U, ECtx);
      }
      let [ELeft, ECtxLeft] = walkDownActionCtx(Offset(0, inCount), E, ECtx);
      let resultLeft = backPropagate(ELeft, left, ECtxLeft);
      let [ERight, ECtxRight] = walkDownActionCtx(Offset(inCount), E, ECtx);
      let resultRight = backPropagate(ERight, right, ECtxRight);
      return merge(resultLeft, resultRight);
    }
    
    // TODO: If edit action is Up or Down, we walk it before continuing. When we wrap something, we wrap it where it is directly.
    // At this point, we have New, Up, Down, and Concats.
    let [solution, subProblems, newECtx] = partitionEdit(E, U, ECtx);
    // Now we prefix action with the Reuse and ReuseOffset from the context and call it a solution.
    solution = prefixReuse(newECtx, solution);
    if(editActions.__debug) {
      console.log("intermediate solution:\n"+stringOf(solution));
    }
    for(let [E, U, ECtx] of subProblems) {
      solution = merge(solution, backPropagate(E, U, ECtx));
    }
    return solution;
  }
  editActions.backPropagate = backPropagate;
  
  // Computes the output length that a children of ChildEditActions would produce on original data
  function lengthOfArray(childEditActions) {
    var i = 0;
    while(true) {
      if(!(i in childEditActions)) return i;
      i++;
    }
  }
  
  // Computes the length that a given edit action would produce when it is applied on something of length contextCount
  function outLength(editAction, contextCount) {
    if(Array.isArray(editAction)) {
      return outLength(editAction[0]);//Approximation
    }
    if(editActions.__debug) console.log("outLength", stringOf(editAction), "("+contextCount+")");
    if(typeof editAction.cachedOutLength == "number") {
      return editAction.cachedOutLength;
    }
    if(editAction.ctor == Type.Concat) {
      let rightLength = outLength(editAction.secondAction, MinUndefined(contextCount, editAction.count));
      if(rightLength === undefined) {
        return undefined;
      }
      return editAction.count + rightLength;
    }
    if(editAction.ctor == Type.New) {
      if(typeof editAction.model === "string") {
        return editAction.model.length;
      } else {
        return lengthOfArray(editAction.childEditActions);
      }
    }
    if(editAction.ctor == Type.Reuse) {
      if(editActions.__debug) console.log("contextCount", contextCount);
      let l = contextCount || 0;
      let hadSome = false;
      for(let k in editAction.childEditActions) {
        if(Number(k) > l) l = Number(k);
        hadSome = true;
      }
      let result = hadSome ? l : typeof contextCount != "undefined" ? l : undefined;
      if(editActions.__debug) console.log("Results in ", result);
      return result;
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
      let newLength = isOffset(editAction.keyOrOffset) ? MinUndefined(editAction.keyOrOffset.newLength, MinusUndefined(contextCount, editAction.keyOrOffset.count)) : undefined;
      return outLength(editAction.subAction, newLength);
    }
    if(editAction.ctor == Type.Sequence) {
      return outLength(editAction.second, contextCount);
    }
    console.trace("outLength invoked on unexpected input", editAction);
    return undefined;
  }
  /*
  function outHeadLength(editAction) {
    return editAction.subAction.ctor == Type.Reuse ? 
               isIdPath(editAction.subAction.path) ?
                 editAction.count
               : editAction.cachedOutLength
             : editAction.subAction.ctor == Type.New ?
                 typeof editAction.subAction.model === "string" ?
                   editAction.subAction.model.length
                 : lengthOfArray(editAction.subAction.childEditActions)
               : outLength(editAction.subAction, editAction.count);
  }*/
  
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
      let complexValStr = uneval(complexVal);
      let simpleValStr = uneval(simpleVal);
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
  isCompatibleForForkDefault = function(oldVal, newVal) {
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
    options = {maxCloneUp: 2, maxCloneDown: 2, isCompatibleForReuseObject: isCompatibleForReuseObjectDefault, isCompatibleForFork: isCompatibleForForkDefault, ...options};
    if(o == "function" || n == "function") {
      console.log("/!\\ Warning, trying to diff functions. Returning Reuse()", oldVal, newVal);
      return Reuse(); // Cannot diff functions
    }
    
    // Considers the newVal as a thing to completely replace the old val.
    // Specification: apply(newObjectDiffs(), oldVal, oldValCtx) = newVal
    function newObjectDiffs() {
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
          // Here we can assumbe by induction that
          // apply(cd, oldVal, oldValCtx) = newVal[key]
          if(cd.ctor == Type.Choose) { // Only filter and sorting here.
            let onlySimpleChildClones = Collection.map(cd.subActions,
              subAction => isSimpleChildClone(subAction)
            );
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
      printDebug("addNewObjectDiffs");
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
        if(Array.isArray(oldVal) && Array.isArray(newVal) && options.isCompatibleForFork(oldVal, newVal)) {
          // We are going to cheat and compare string diffs.
          let sep = "#"; // A very small string not found in oldVal or newVal
          let newValStr, oldValStr, newValStrElems, oldValStrElems;
          while(true) {
            newValStr = newVal.map(x => uneval(x)).join(sep);
            newValStrElems = newValStr.split(sep);
            oldValStr = oldVal.map(x => uneval(x)).join(sep);
            oldValStrElems = oldValStr.split(sep);
            if(oldValStrElems.length != oldVal.length || newValStrElems.length != newVal.length) {
              sep = makeNotFoundIn(sep, newValStr);
              sep = makeNotFoundIn(sep, oldValStr);
              continue;
            } else {
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
          
          // Ok, so now we have the two strings. Let's diff them and see where the forks are.
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
          //function toForks(strEdit, newElemsStr, oldElemsStr, sep) {
          // Algorithm:
          // We tag elements from newElemsStr and oldElemsStr with the number of insertions and deletions inside them.
          // when new and old cross a separator together, we mark the mapping.
          // At the end, around every removed separator, we choose which element was removed according to the one having the most deletions.
          // 
          let indexNew = 0; // Incremented after a separator.
          let indexOld = 0;
          let index = 0;
          let newIsSep = false;
          let oldIsSep = false;
          let oldActions = oldValStrElems.map(x =>
            ({deleted: 0, kept: 0, str: x, isDeleted: false}));
          let newActions = newValStrElems.map(x =>
            ({inserted: 0, kept: 0, str: x, isInserted: false}));
          let oldSeps = oldValStrElems.slice(1).map(x => 
            ({deleted: 0, kept: 0, str: sep, isDeleted: false}))
          let newSeps = newValStrElems.slice(1).map(x => 
            ({inserted: 0, kept: 0, str: sep, isInserted: false}));
          function unlabelledLength(entry, count) {
            return Math.min(entry.str.length - ("inserted" in entry ? entry.inserted : 0) - ("deleted" in entry ? entry.deleted : 0) - entry.kept, count);
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
                [oldIsSep, indexOld] = handleLength(s[1].length, oldIsSep, indexOld, oldActions, oldSeps, "deleted");
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
          let aSepWasDeletedOrInserted = false;
          printDebug("oldActions", oldActions);
          printDebug("newActions", newActions);
          printDebug("oldSeps", oldSeps);
          printDebug("newSeps", newSeps);
          // Ok, now, the classification.
          for(let k in oldSeps) {
            let sep = oldSeps[k];
            if(sep.deleted > sep.kept) { // sep has an odd length, there cannot be equality
              sep.isDeleted = true;
              aSepWasDeletedOrInserted = true;
              // We find the element nearby which is the most likely to be deleted.
              let left = oldActions[k];
              let right = oldActions[Number(k) + 1];
              if(left.isDeleted) {
                right.isDeleted = true;
              } else if(right.isDeleted) {
                left.isDeleted = true;
              } else {
                if((k + 1 in oldSeps) && oldSeps[k+1].deleted > oldSeps[k+1].kept) {
                  left.isDeleted = true;
                } else {
                  let leftRatio = left.deleted / (left.deleted + left.kept + 1);
                  let rightRatio = right.deleted / (right.deleted + right.kept + 1 );
                  if(leftRatio > rightRatio) {
                    left.isDeleted = true;
                  } else {
                    right.isDeleted = true;
                  }
                }
              }
            }
          }
          for(let k in newSeps) {
            k = Number(k);
            let sep = newSeps[k];
            if(sep.inserted > sep.kept) {
              sep.isInserted = true;
              aSepWasDeletedOrInserted = true;
              // We find the element nearby which is the most likely to be deleted.
              let left = newActions[k];
              let right = newActions[Number(k) + 1];
              if(left.isInserted) {
                right.isInserted = true;
              } else if(right.isInserted) {
                left.isInserted = true;
              } else { // If the next separator is also inserted, that means that the data inside is inserted anyway.
                if((k + 1 in newSeps) && newSeps[k+1].inserted > newSeps[k+1].kept) {
                  left.isInserted = true;
                } else {
                  let leftRatio = left.inserted / (left.inserted + left.kept + 1);
                  let rightRatio = right.inserted / (right.inserted + right.kept + 1 );
                  if(leftRatio > rightRatio) {
                    left.isInserted = true;
                  } else {
                    right.isInserted = true;
                  }
                }
              }
            }
          }
          if(!aSepWasDeletedOrInserted && newActions.length == oldActions.length) { // Alignment decided that elements are the same.
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
            // Ok, now newActions.isInserted and oldActions.isDeleted contains a consistent view of elements which were aligned or not.
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
              let countDeleted = 0;
              while(indexOld < oldActions.length && oldActions[indexOld].isDeleted) {
                indexOld++;
                countDeleted++;
              }
              /**
                   acc1 = tail => tail
                   Delete(1, .)
                   acc2 = tail => Delete(1, tail)
                        = tail => acc1(Delete(1, tail))
                   Delete(3, .)
                   acc3 = tail => Delete(1, Delete(3, tail))
                        = tail => acc2(Delete(3, tail))
              */
              if(countDeleted > 0) {
                printDebug("Detected deletion of " + countDeleted);
                acc = ((acc, countDeleted) => tail => acc(Delete(countDeleted, tail)))(acc, countDeleted);
                tmpValCtx = AddContext(Offset(countDeleted), tmpVal, tmpValCtx);
                tmpVal = tmpVal.slice(countDeleted);
                tmpValStrElems = tmpValStrElems.slice(countDeleted);
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
                  let newEdit = editDiff(tmpVal, newVal[indexNew - countInserted + i], {...options, isCompatibleForFork: () => false}, tmpValCtx);
                  o[i] = newEdit;
                }
                let n = New(o);
                acc = ((acc, countInserted, n) => tail => acc(Insert(countInserted, n, tail)))(acc, countInserted, n);
              }
              let countKept = 0;
              // Keeps
              while(indexNew < newActions.length && indexOld < oldActions.length && !newActions[indexNew].isInserted && !oldActions[indexOld].isDeleted) {
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
                  isIdentity(tail) ? n : Fork(countKept, countKept, n, tail)))(acc, n, countKept, allIdentity);
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
   * which means: delete 'Hello', add 'Goodbye' and keep ' world.'
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
            // Delete the offending records and add the merged ones.
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
              acc = Delete(f[1].length, Insert(s[1].length, New(s[1]), acc));
              index -= 2;
              break;
            }
          }
          acc = Insert(s[1].length, New(s[1]), acc);
          index -= 1;
          break;
        case DIFF_DELETE: // We were already at the deletion position
          acc = Delete(s[1].length, acc);
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
  
  function arrayFlatMap(array, fun) {
    let result = [];
    if(!Array.isArray(array)) {
      console.log("Not an array", array);
    }
    for(let x of array) {
      let intermediate = fun(x);
      Array.prototype.push.apply(result, intermediate);
    }
    return result;
  }
  
  function deepCopy(object) {
    if(typeof object == "object") {
      let t = treeOpsOf(object);
      let model = t.init();
      for(let k in object) {
        t.update(model, k, deepCopy(t.access(object, k)));
      }
      return model;
    }
    return object;
  }
  function modelToCopy(editAction, prog) {
    return editAction.ctor == Type.New ? editAction.model : prog;
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
      update(x, k, v) { x[k] = v; }
    },
    RecordLike: {
      init() { return {}; },
      access(x, k) { return x[k]; },
      update(x, k, v) { x[k] = v; }
    },
    MapLike: {
      init() { return new Map(); },
      access(x, k) { return x.get(k); },
      update(x, k, v) { x.set(k, v) ; }
    }
  }
  function treeOpsOf(x) {
    return typeof x === "object" ? x instanceof Map ? treeOps.MapLike : Array.isArray(x) ? treeOps.Array : treeOps.RecordLike : treeOps.RecordLike;
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
    if(Collection.is(editAction)) {
      editAction = Collection.onlyElemOfCollectionOrDefault(editAction);
      if(editAction === undefined) return false;
    }
    if(!isEditAction(editAction)) return false;
    if(editAction.ctor == Type.Reuse) {
      if(!hasChildEditActions(editAction)) return true;
    }
    return false;
  }
  editActions.isIdentity = isIdentity;
  
  function printDebug() {
    if(editActions.__debug) {
      for(let arg of arguments) {
        if(typeof arg === "string") console.log(arg);
        else console.log(uneval(arg));
      }
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
      str += "Offset(" + keyOrOffset.count;
      if(keyOrOffset.newLength !== undefined) {
        str += ", " + keyOrOffset.newLength;
      }
      if(keyOrOffset.oldLength !== undefined) {
        str += ", " + keyOrOffset.oldLength;
      }
      str += ")"
    } else {
      str += JSON.stringify(keyOrOffset);
    }
    return str;
  }
  
  // Given a pair (prog, ctx), walks the context down by the provided key or offset and returns a [new prog, new ctx]
  function walkDownCtx(downKeyOrOffset, prog, ctx) {
    return [applyKeyOrOffset(downKeyOrOffset, prog), AddContext(downKeyOrOffset, prog, ctx)];
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
      let newOffset = downUpOffsetReturnsUp(keyOrOffset, upKeyOrOffset);
      let newDownOffset = upToDownOffset(newOffset);
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
    return !isNaN(num)
  }
  function numIfPossible(num) {
    if(isNumeric(num)) return Number(num);
    return num;
  }
  
  function stringOf(self) {
    self = typeof self !== undefined ? self: this;
    if(Array.isArray(self)) {
      return "[" + self.map(stringOf).join(",\n").replace(/\n/g, "\n ") + "]";
    }
    if(!(isEditAction(self))) { return uneval(self, ""); }
    let isNew = self.ctor == Type.New;
    let childIsSimple = child => 
      child.ctor == Type.New && (
            typeof child.model == "boolean" || 
            typeof child.model == "string" || 
            typeof child.model == "number" || typeof child.model == "undefined");
    let children = () => {
      let childrenStr = "";
      for(let k in self.childEditActions) {
        let child = self.childEditActions[k];
        let childStr =
          Array.isArray(child) ?
             isNew && child.length == 1 && childIsSimple(child[0]) ? editActions.uneval(child[0].model) :
             stringOf(child)
          : isNew && childIsSimple(child) ? editActions.uneval(child.model) : stringOf(child);
        childrenStr += (childrenStr.length == 0 ? "" : ",\n") + k + ": " +
          childStr
      }
      childrenStr += "}";
      return childrenStr;
    }
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
      let str = "Down(";
      let selfIsIdentity = false;
      while(self && self.ctor == Type.Down) {
        str += keyOrOffsetToString(self.keyOrOffset);
        self = self.subAction;
        selfIsIdentity = isIdentity(self);
        if(!selfIsIdentity)
          str += ", ";
      }
      if(!selfIsIdentity) str += stringOf(self);
      str += ")";
      return str;
    } if(self.ctor == Type.Reuse) {
      var result    = "Reuse(";
      if(hasChildEditActions(self)) {
        result += "{\n  ";
        result += addPadding(children(), "  ");
      }
      result += ")";
      return result;
    } else if(self.ctor == Type.New) { // New
      let str = "New(";
      result += (result === "New(" ? "": ",");
      let model = self.model;
      if(typeof model !== "object") {
        str += uneval(model);
      } else {
        let parts = [];
        let allNumeric = true;
        let expectedIndex = 0;
        // As per JS spec, numeric keys go first.
        for(let k in self.childEditActions) {
          if(!isNumeric(k)) {
            allNumeric = false;
          } else {
            k = Number(k);
            while(expectedIndex < k) {
              parts.push([expectedIndex, "undefined"])
              expectedIndex++;
            }
          }
          let child = self.childEditActions[k];
          let childStr =
            Array.isArray(child) ?
              child.length == 1 && childIsSimple(child[0]) ?
                editActions.uneval(child[0].model)
              : stringOf(child)
            : childIsSimple(child) ?
                editActions.uneval(child.model) :
                stringOf(child);
          parts.push([k, childStr]);
          expectedIndex++;
        }
        if(allNumeric && Array.isArray(model) && model.length == 0) {
          let extraSpace = parts.length > 1 && parts[0][1].indexOf("\n") >= 0 ? "\n" : "";
          str += "[" + extraSpace + parts.map(([k, s]) =>  addPadding(s, "  ")).join(", ") + "]";
        } else {
          str += "{\n" + parts.map(([k, s]) =>  k + ": " + addPadding(s, "  ")).join(",") + "}, " + (model instanceof Map ? "new Map()" : uneval(model));
        }
      }
      str += ")";
      return str;
    } else if(self.ctor == Type.Concat) { // Fork
      let [inCount, outCount, left, right] = argumentsIfFork(self);
      str = "";
      if(right !== undefined && editActions.__syntacticSugarFork) {
        let [keep, subAction] = argumentsIfForkIsKeep(inCount, outCount, left, right);
        if(subAction !== undefined && editActions.__syntacticSugar) {
          str = "Keep(" + keep + ", ";
          let childStr = stringOf(subAction);
          str += addPadding(childStr, "  ");
          str += ")";
        } else {
          let [del, subAction] = argumentsIfForkIsDelete(inCount, outCount, left, right);
          if(subAction !== undefined && editActions.__syntacticSugar) {
            str = "Delete(" + del;
            str += isIdentity(subAction) ? "" : ", " + addPadding(stringOf(subAction), "  ");
            str += ")";
          } else {
            let [nInsert, inserted, second] =argumentsIfForkIsInsert(inCount, outCount, left, right);
            if(second !== undefined && editActions.__syntacticSugar) {
              str += "Insert(" + nInsert + ", ";
              let childStr = addPadding(childIsSimple(inserted) ? uneval(inserted.model) : stringOf(inserted), "  ");
              str += childStr;
              let extraSpace = childStr.indexOf("\n") >= 0 ? "\n " : "";
              if(!isIdentity(second)) {
                let secondStr = addPadding(stringOf(second), "  ");
                extraSpace = extraSpace == "" && secondStr.indexOf("\n") >= 0 ? "\n " : extraSpace;
                str += ","+extraSpace+" " + addPadding(stringOf(second), "  ");
              }
              str += ")"
            } else {
              str = "Fork(" + inCount + ", " + outCount + ",\n  ";
              let leftStr = stringOf(left);
              let rightStr = stringOf(right);
              str += addPadding(leftStr, "  ") + ",\n  "
              str += addPadding(rightStr, "  ") + ")";
            }
          }
        }
      } else {
        let insertRight = isInsertRight(self);
        str = (insertRight ? "InsertRight" : "Concat") + "(" + self.count + ", ";
        str += addPadding(stringOf(self.first), "  ")
        str += ", " + addPadding(stringOf(self.second), "  ") + ")";
      }
      return str;
    } else if(self.ctor == Type.Custom) { // Custom
      let str = "Custom(";
      let outerPadding = toSpaces(str);
      str += addPadding(stringOf(self.subAction), outerPadding);
      str += ", " + self.lens.name + ")";
      return str;
    } else if(self.ctor == Type.Sequence) {
      var str = "Sequence(\n  ";
      var padding = "  ";
      var tmp = self;
      str += addPadding(stringOf(self.first) + ",\n", padding);
      str += addPadding(stringOf(self.second), padding);
      if(self.ctx !== undefined) {
        str += ", " + stringOf(self.ctx);
        str += "])";
      }
      str += ")";
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
    ?= r[0..c[ ++c apply(Reuse({(k-c): mapUpHere(Ek, k, Offset(c, n), Up(k))}), r[c..c+n[, (Offset(c, n), r)::rCtx)
    
    We need to prove that 
      r[c[.[k -> apply(Ek, x, (k, r)::rCtx)] 
    ?= r[c].[k -> apply(mapUpHere(Ek, k, Offset(c), Up(k)), x, (k-c, r[c[)::(Offset(c), r)::rCtx))]
    = apply(Reuse({(k-c): mapUpHere(Ek, k, Offset(c), Up(k))}), r[c[, (Offset(c), r)::rCtx)
    
    We need to prove that:
    apply(Ek, x, (k, r)::rCtx)
    ?= apply(mapUpHere(Ek, k, Offset(c), Up(k)), x, (k-c, r[c[)::(Offset(c), r)::rCtx))
    
    If we prove invariant 1) and 2) below, then for LCtx = [], we prove the equality above.
  
    Invariant:
    
    1) pathToHere consists only of Ups and always ends with a Up(k, Reuse())
    Proved inline. QED.
    
    2) Invariant to prove
    Assuming: 
      mkPath((f, x)::ctx, E) = Up(f, mkPath(ctx, E))
      mkPath([], E) = E
    
    apply(Ej, x, LCtx ++ (k, r)::rCtx)
    = apply(mapUpHere(Ej, k, Offset(c), mkPath(LCtx, Up(k))), x, LCtx ++ (k-c, r[c[)::(Offset(c), r)::rCtx)
  */
  // mapUpHere enables us to change the key of a Reuse statement by an offset. We change its underlying sub edit action by wrapping it up calls to the main expression to Up(the new offseted key, the offset, the edit action on the main expression)
  //
  // Formally, if k >= c, then
  //   apply(Reuse({k: Ek}), r, rCtx)
  // = r[0..c[ ++c apply(Reuse({(k-c): mapUpHere(Ek, k, Offset(c, n), Up(k))}), r[c..c+n[, (Offset(c, n), r)::rCtx)
  function mapUpHere(editAction, k, offset, pathToHere = Reuse()) {
    if(editActions.__debug) {
      console.log("mapUpHere(", stringOf(editAction), stringOf(pathToHere));
    }
    switch(editAction.ctor) {
    case Type.Up:
      // Only the first. Guaranteed to be a key.
      let newPathToHere = Down(editAction.keyOrOffset, pathToHere);
      if(isIdentity(newPathToHere)) {
        /** Proof of 2)
        Ej = Up(m, X)
        newPathHere has to be identity
        i.e. Down(m, mkPath(LCtx, Up(k))) == Reuse()
        if LCtx was not [], then Down cannot compensate. Hence, LCtx = [], and furthermore, m == k
        
        apply(mapUpHere(Ej, k, Offset(c), mkPath(LCtx, Up(k)), x, LCtx ++ (k-c, r[c[)::(Offset(c), r)::rCtx))
        =  apply(mapUpHere(Ej, k, Offset(c), Up(k), x, (k-c, r[c[)::(Offset(c), r)::rCtx))
        =  apply(Up(k-c, Offset(c), X), x, (k-c, r[c[)::(Offset(c), r)::rCtx))   -- x = r[k]
        =  apply(Up(Offset(c), X), r[c[, (Offset(c), r)::rtx))
        =  apply(X, r, rCtx)
        =  apply(Up(k, X), x, (k, r)::rCtx)
        =  apply(Ej, x, (k, r,)::rCtx)
        QED.
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
                 
          apply(mapUpHere(Ej, k, Offset(c), mkPath(LCtx, Up(k))), x, LCtx ++ (k-c, r[c[)::(Offset(c), r)::rCtx))
          = apply(Up(f, mapUpHere(X, k, Offset(c), Down(f, mkPath(LCtx, Up(k))))), x, LCtx ++ (k-c, r[c[)::(Offset(c), r)::rCtx))
          = apply(Up(f, mapUpHere(X, k, Offset(c), Down(f, Up(k', mkPath(LCtx', Up(k)))))), x, ((k', x')::LCtx') ++ (k-c, r[c[)::(Offset(c), r, r)::rCtx)
            f has to equal k' and
          = apply(mapUpHere(X, k, Offset(c), mkPath(LCtx', Up(k))), x', LCtx' ++ (k-c, r[c[)::(Offset(c), r)::rCtx)
            by induction
          = apply(X, x', LCtx' ++ (k, r)::rCtx)
          = apply(Up(f, X), x, ((k', x')::LCtx') ++ (k, r)::rCtx)
          = apply(Ej, x, LCtx ++ (k, r)::rCtx)
          QED.
          
          2. where k' is an offset is probably very similar, albeit more complicated.
        */
        let newSubAction = mapUpHere(editAction.subAction, k, offset, newPathToHere);
        return newSubAction == editAction.subAction ? editAction : Up(editAction.keyOrOffset, mapUpHere(editAction.subAction, k, offset, newPathToHere));
      }
    case Type.Down: {
      /** Proof 1) the new pathToHere has one more Up, so it ends with Up(k) again and contains only Up*/
      /** Proof 2)
        Ej = Down(f, Y) where f is a key
      
        = apply(mapUpHere(Ej, k, Offset(c), mkPath(LCtx, Up(k))), x, LCtx ++ (k-c, r[c[)::(Offset(c), r)::rCtx)
        = apply(Down(f, mapUpHere(Y, k, Offset(c), Up(f, mkPath(LCtx, Up(k))))), x, LCtx ++ (k-c, r[c[)::(Offset(c), r)::rCtx)
        = apply(mapUpHere(Y, k, Offset(c), Up(f, mkPath(LCtx, Up(k)))), x[f], (f, x)::LCtx ++ (k-c, r[c[)::(Offset(c), r)::rCtx)
        = apply(mapUpHere(Y, k, Offset(c), mkPath((f, x)::LCtx, Up(k))), x[f], (f, x)::LCtx ++ (k-c, r[c[)::(Offset(c), r)::rCtx)
        = apply(Y, x[f], (f, x)::LCtx ++ (k, r)::rCtx)
        = apply(Ej, x, LCtx ++ (k, r)::rCtx)
        QED;
      */
      let newSubAction = mapUpHere(editAction.subAction, k, offset, Up(editAction.keyOrOffset, pathToHere));
      return newSubAction != editAction.subAction ? Down(editAction.keyOrOffset, newSubAction) : editAction;
    }
    case Type.Reuse:
      /** Proof of 1) the new pathToHere has one more Up, so it ends with Up(k) again and contains only Up */
      
      /** Proof of 2) Similar to the case of Down */
      let newChildEditActions = mapChildren(editAction.childEditActions, (k, v) =>  mapUpHere(v, k, offset, Up(k, pathToHere)));
      if(newChildEditActions == editAction.childEditActions) {
        return editAction;
      } else {
        return Reuse(newChildEditActions);
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
      let newChildEditActions = mapChildren(editAction.childEditActions, (k, v) =>  mapUpHere(v, k, offset, pathToHere));
      if(newChildEditActions == editAction.childEditActions) {
        return editAction;
      } else {
        return New(newChildEditActions, editAction.model);
      }
    }
    case Type.Concat: {
      /** Proof of 1) Trivial, same pathToHere */
      
      /** Proof 2) Same as New. */
      let newFirst = mapUpHere(editAction.first, k, offset, pathToHere);
      let newSecond = mapUpHere(editAction.second, k, offset, pathToHere);
      if(newFirst == editAction.first && newSecond == editAction.second) {
        return editAction;
      } else {
        return Concat(editAction.count, newFirst, newSecond);
      }
    }
    case Type.Custom: {
      /** 1) Trivial, same pathToHere */
      let newSubAction = mapUpHere(editAction.subAction, k, offset, pathToHere);
      if(newSubAction = editAction.subAction) {
        return editAction;
      } else {
        return {...editAction, subAction: newSubAction}; 
      }
    }
    default: return editAction;
    }
  }
})(editActions)

if(typeof module === "object") {
  module.exports = editActions;
}