var editActions = require("./edit-actions.js");
var {List,Reuse,New,Concat,Keep,Prepend, Append,Remove,RemoveExcept,RemoveAll,Up,Down,Custom,UseResult,Type,Offset,__AddContext,__ContextElem,isOffset,uneval,apply,andThen, Replace, splitAt, downAt, offsetAt, stringOf, Sequence, merge, ReuseOffset, backPropagate, isIdentity, Choose, diff, first, debug, Interval, Insert, InsertAll, ReuseModel, ReuseAsIs, transform} = editActions;
var tests = 0, testToStopAt = undefined;
var testsPassed = 0; linesFailed = [], incompleteLines = [];
var bs = "\\\\";
var failAtFirst = true;

shouldBeEqual(
  apply(Down.pure("a", "b", 1), {a: {b: {"1": 2}}}), 1
);

shouldBeEqual(stringOf(New([1, 2])), "New([1, 2])");
shouldBeEqual(stringOf(New({1: New(2)}, [])), "New([undefined, New(2)])")
shouldBeEqual(stringOf(Down.pure("a", 1)), "Down.pure(\"a\", 1)");
shouldBeEqual(stringOf(Down.pure("a", true)), "Down(\"a\", true)");
shouldBeEqual(stringOf(Reuse({a: 0})), "Reuse({\na: 0})");


shouldBeEqual(
  stringOf(New(undefined)), "New(undefined)"
);

shouldBeEqual(
  andThen(
    Reuse({a: Reuse({b: New(1)})}),
    Reuse()),
  Reuse({a: Reuse({b: New(1)})})
  );

shouldBeEqual(stringOf(Reuse({a: New(1)})), "Reuse({\na: New(1)})");
shouldBeEqual(stringOf(New({a: Down("a", New(1))}, ReuseModel())), "Reuse({\na: New(1)})");
shouldBeEqual(stringOf(Reuse()), "Reuse()");
shouldBeEqual(stringOf(Insert("a", {a: 1, b: 2})), "Insert(\"a\", {\na: 1,\nb: 2})");
shouldBeEqual(stringOf(InsertAll({a: 1, b: 2})), "InsertAll({\na: 1,\nb: 2})");
shouldBeEqual(stringOf(New({a: 1, b: 2, c: 3}, {a: true, b: true})), "New({\na: 1,\nb: 2,\nc: 3}, {a: WRAP, b: WRAP})");
var partialArray = [];
partialArray[0] = true;
partialArray[2] = true;
shouldBeEqual(stringOf(New([1, 2, 3], partialArray)), "New([1, 2, 3], [WRAP, NEW, WRAP])");

shouldBeEqual(apply(Reuse({a: Reuse({b: New(1)}), d: 2}), {a: {b: 2}}), {a: {b: 1}, d: 2});

shouldBeEqual(
  stringOf(Append(3, "abc")), "Append(3, \"abc\")" 
);
shouldBeEqual(
  stringOf(Append(3, Prepend(1, "d"), New("abc"))), "Append(3, \n  Prepend(1, \"d\"),\n  New(\"abc\"))" 
);
shouldBeEqual(
  andThen(
    Prepend(3, New("abc")),
    Prepend(2, New("de"))
  ),
  Prepend(3, New("abc"), Prepend(2, "de"))
);
shouldBeEqual(
  andThen(
    Reuse({
      0: New(1),
      3: New(2)
    }),
    Prepend(2, New([New(0), New(3)]))
  ),
  Prepend(2, New([New(1), New(3)]), Reuse({1: New(2)}))
);

shouldBeEqual(
  stringOf(Down(Interval(3, 5))), "Down(Interval(3, 5))"
);
shouldBeEqual(
  stringOf(Remove(1, Keep(2, Prepend(1, "a")))), "Remove(1, Keep(2, Prepend(1, \"a\")))"
);
shouldBeEqual(
  stringOf(RemoveAll()), "RemoveAll()"
);
shouldBeEqual(
  stringOf(RemoveAll(Prepend(1, "a"))), "RemoveAll(Prepend(1, \"a\"))"
);
shouldBeEqual(
  stringOf(RemoveAll(Reuse(), 5)), "RemoveAll(Reuse(), 5)"
);
shouldBeEqual(
  stringOf(RemoveExcept(Offset(5, 0), Prepend(1, "a"))), "RemoveExcept(Interval(5, 5), Prepend(1, \"a\"))"
);
shouldBeEqual(
  stringOf(RemoveExcept(Offset(5, 0), Reuse())), "RemoveExcept(Interval(5, 5))"
);
shouldBeEqual(
  stringOf(RemoveExcept(Offset(5, 0))), "RemoveExcept(Interval(5, 5))"
);
shouldBeEqual(
  stringOf(RemoveExcept(Offset(3, 2))), "RemoveExcept(Interval(3, 5))"
);
shouldBeEqual(
  stringOf(Down(Interval(2, 9), RemoveExcept(Interval(3, 5)))), "Down(Interval(2, 9), RemoveExcept(Interval(3, 5)))"
);
shouldBeEqual(
  stringOf(Down(Offset(2, 7), Down(Offset(3, 2)))), "Down(Interval(5, 7))"
);
shouldBeEqual(
  stringOf(RemoveExcept(Offset(2, 7), RemoveExcept(Offset(3, 2)))), "RemoveExcept(Interval(5, 7))"
);
shouldBeEqual(
  stringOf(Remove(3, Prepend(2, "ab"))), "Remove(3, Prepend(2, \"ab\"))"
);
shouldBeEqual(
  andThen(RemoveExcept(Offset(3, 2)), RemoveExcept(Offset(2, 7))),
  RemoveExcept(Offset(5, 2))
);

/*
function intRand(minInclusive, maxInclusive = 1) {
  let m = Math.min(minInclusive, maxInclusive);
  let n = Math.max(minInclusive, maxInclusive);
  return Math.floor(Math.random() * (n - m + 1)) + m;
}

function randomRecord(depth = 1) {
  if(depth <= 0) return {};
  let record = {};
  if(intRand(1, 2) == 1) record[("a" + intRand(1000))] = randomRecord(depth-1);
  if(intRand(1, 2) == 1) record[("b" + intRand(1000))] = randomRecord(depth-1);
  if(intRand(1, 2) == 1) record[("c" + intRand(1000))] = randomRecord(depth-1);
  return record;
}
possibilities = ["New", "Reuse", "UpDown", "UpDown", "UpDown"];
function randomEditAction(depth, record, ctx) {
  if(depth <= 0) return Reuse();
  let canUp = ctx !== undefined;
  if(typeof record !== "object") {
    console.trace("Not a record?!");
    throw "error"
  }
  let canDown = Object.keys(record).length > 0;
  while(true) {
    let choice = possibilities[intRand(0, possibilities.length - 1)];
    if(choice == "New") {
      let editNew = randomRecord();
      for(let k in editNew) {
        editNew[k] = randomEditAction(depth-1, record, ctx);
      }
      return New(editNew);
    } else if(choice == "Reuse") {
      let editReuse = {};
      for(let k in record) {
        if(intRand(1, 2) == 1) {
          editReuse[k] = randomEditAction(depth-1, record[k], __AddContext(k, record, ctx));
        }
      }
      return Reuse(editReuse);
    } else {
      if(canUp && (!canDown || intRand(1, 2) == 1)) {
        return Up(ctx.hd.keyOrOffset, randomEditAction(depth-1, ctx.hd.prog, ctx.tl));
      }
      let keys = Object.keys(record);
      if(keys.length > 0) {
        let k = keys[intRand(0, keys.length-1)];
        return Down(k, randomEditAction(depth-1, record[k], __AddContext(k, record, ctx)));
      }
    }
  }
}

for(var i = 0; i < 1000000; i++) {
  var a = randomRecord(1);
  
  var edit1 = randomEditAction(2, a);
  var b = apply(edit1, a);
  var edit2 = randomEditAction(3, b);
  var c = apply(edit2, b);
  var edit3 = randomEditAction(1, c);
  var d = apply(edit3, c);

  shouldBeEqual(
    andThen(andThen(edit3, edit2), edit1),
    andThen(edit3, andThen(edit2, edit1)),
    () => {
      debug(a);
      debug(edit1);
      debug(b);
      debug(edit2);
      debug(c);
      debug(edit3);
      debug(d);
      return "this one";
    }
    );
}

e();*/

shouldBeEqual(
  apply(
  Up(Offset(0, 0), Down(0)),
  [],
  __AddContext(Offset(0, 0, 0), [ ], __AddContext(Offset(0, 0), [ "a", "b", "c", "d", "e", "f"]))),
  "a"
);

shouldBeEqual(
  andThen(
    Replace(4, 4, Reuse({1: New(2)}), Reuse({3: 0})),
    Replace(2, 3, Reuse({2: New(1)}), Reuse())),
  Replace(2, 3,
  Reuse({
    1: New(2),
    2: New(1)}),
  Keep(1, Reuse({
      3: 0}))));


shouldBeEqual(
  andThen(
    Prepend(2, "ab"),
    Prepend(3, "cde")
  ),
  Prepend(5, "abcde")
);

shouldBeEqual(
  andThen(
    Keep(1, Prepend(2, "ab")),
    Prepend(3, "cde")
  ),
  Prepend(5, "cabde")
);

shouldBeEqual(
  andThen(
    Keep(4, Prepend(2, "ab")),
    Prepend(3, "cde")
  ),
  Prepend(3, "cde", Keep(1, Prepend(2, "ab")))
);

shouldBeEqual(
  andThen(
    Keep(3, Prepend(2, "ab")),
    Prepend(3, "cde")
  ),
  Prepend(3, "cde", Prepend(2, "ab"))
);

shouldBeEqual(
  stringOf(Up(Offset(0, 0), Down(Offset(0, 0)))), "Reuse()"
);
shouldBeEqual(
  stringOf(Prepend(1, "k")), "Prepend(1, \"k\")"
);

shouldBeEqual(
  stringOf(Up(Offset(0, 0), New([New(1)]))), "Up(Interval(0, 0), New([New(1)]))"
);

shouldBeEqual(
  diff(["a", "b", "c", "d"], ["a", "k", "c", "d"]),
  Choose(Reuse({1: Remove(1, Prepend(1, New("k")))}),
    New([Down(0), New("k"), Down(2), Down(3)]))
);

shouldBeEqual(
  first(diff(["a", "b", "c", "d"], ["a", "d", "c", "b"])),
  Reuse({1: Up(1, Down(3)), 3: Up(3, Down(1))})
);

shouldBeEqual(
  first(diff(["a", "b",  "c", "d"], ["a", "b", "k", "m", "c", "d"])),
  Keep(2, Prepend(2, New([New("k"), New("m")])))
);

shouldBeEqual(
  first(diff([["p", "test"], "d", "blih", "mk"],
             [["x", ["p", "test"]], ["i", "hello"], "d", "blah"])),
  Replace(1, 1,
    Reuse({0: New([New("x"), Reuse()])}),
    Prepend(1, New([New([New("i"), New("hello")])]),
      Replace(2, 2, 
          Reuse({1:
            Keep(2, Remove(1, Prepend(1, New("a"))))}),
            Remove(1))))
);

shouldBeEqual(
  Choose(New(1), Choose(New(2), New(3))),
  Choose(New(1), New(2), New(3))
);

shouldBeEqual(
  andThen(
    Choose(Reuse({x: Reuse({d: New(1)})}), Reuse({y: Reuse({d: New(2)})})),
    New({x: Down("z"), y: Down("w")})
  ),
  Choose(
    New({x: Down("z", Reuse({d: New(1)})), y: Down("w")}),
    New({x: Down("z"), y: Down("w", Reuse({d: New(2)}))}),
  )
);

shouldBeEqual(
  andThen(
    Reuse({x: Up("x", Down("b"))}),
    Choose(New({x: Down("z"), b: Down("d")}), Down("a", Reuse({x: Up("x", "a", Down("z"))})))
  ),
  Choose(New({x: Down("d"),  b: Down("d")}), Down("a", Reuse({x: Up("x", Down("b"))})))
);

shouldBeEqual(
  stringOf(Choose(New(1), New(2))),
  "Choose(\n  New(1),\n  New(2))"
);

shouldBeEqual(
  apply(
    Remove(3, Keep(5, Prepend(2, Up(Offset(7, undefined, 2))))),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
  [3, 4, 5, 6, 7, 1, 2, 8, 9]
);

shouldBeEqual(
  andThen({hd: "hello", 1: Reuse({c: Up("c", Down("a"))})}, Reuse({a: Up("a", Down("b"))})),
  {hd: "hello", 1: Reuse({c: Up("c", Down("b")), a: Up("a", Down("b")), })}
);

// I want an example where:
// - AddActionContext is called with an offset while there is an offset in context.
// - The first one had a non-null relative path.
// I want to check if it's possible to put the relative path in front of the context.
//
shouldBeEqual(
  andThen(
    Reuse({9: Up(9, Down(0))}),
    Replace(5, 5, Reuse({0: Up(0, Offset(0, 5), Down(2))}), Keep(3, Reuse()))
  ),
  Replace(5, 5,
    Reuse({
      0: Up(0, Offset(0, 5), Down(2))}),
    Reuse({
      4: Up(4, Offset(5), Down(2))})));

shouldBeEqual(
  apply({1: Down(2), 2: {a: Reuse({1: 0})}, 3: undefined},
    [0, 1, 2, 3]),
    {1: 2, 2: {a: [0, 0, 2, 3]}, 3: undefined});

shouldBeEqual(
  stringOf(Down(1, {})), "Down(1, { })"
);

shouldBeEqual(
  stringOf(Down(1, {0: Up(1)})), "Down(1, { 0:   Up(1)})"
);

shouldBeEqual(
  stringOf(Down(1, undefined)), "Down(1, undefined)"
);

shouldBeEqual(
  stringOf(Up(1, undefined)), "Up(1, undefined)"
);

shouldBeEqual(
  stringOf(Up(1, Offset(2))), "Up(1, Interval(2))"
);

shouldBeEqual(stringOf(Keep(10, Remove(5))), "Keep(10, Remove(5))");

shouldBeEqual(stringOf(Keep(8, New("1"))), "Keep(8, New(\"1\"))");

shouldBeEqual(stringOf(Replace(5, 0, RemoveAll(), Reuse())),
"Replace(5, 0,\n  RemoveAll())");

shouldBeEqual(stringOf(Keep(3, RemoveAll())), "Keep(3, RemoveAll())");

shouldBeEqual(
  andThen(Down(Offset(3, 5)), Custom(Reuse(), {apply: x => "1"+ x, update: e => ReuseOffset(Offset(1), e), name: "append1"})),
  Custom(Custom(Reuse(), {name: "append1"}), {name: "applyOffset(Interval(3, 8), _)"}))

// This test is failing because Concat is not stored in the context when going down.
testAndThen(
  Down(0, Reuse({a: Up("a", 0, Down(2))})),
  Concat(2, Reuse(), New([Down(0), 1])),
  [{a: "a"}, "b"]
);

shouldBeEqual(
  stringOf(
    Concat(3, Down(Offset(2, 5)), Down(Offset(8)), 8)),  "Replace(8, 3,\n  Down(Offset(2, 5, 8)))"
);

/*
shouldBeEqual(andThen(Down("f"), Custom(Reuse(), x => x, y => y, "id")), Reuse())
*/

shouldBeEqual(Up(Offset(0, 2), Down(Offset(0, 2))), Down(Offset(0, 2, 2)));

shouldBeEqual(stringOf(Up(Offset(2), Down(1))), "Up(Interval(2), Down(1))");

shouldBeEqual(apply(Reuse({ a: New(1) }), {a: 2}), {a: 1});

shouldBeEqual(Keep(3, Reuse()), Reuse());
shouldBeEqual(Keep(3, Keep(5, New("1"))), Keep(8, New("1")));
shouldBeEqual(Keep(3, Keep(5, Reuse())), Keep(8, Reuse()));

shouldBeEqual(Up("a", "b", Reuse()), Up("a", Up("b")));
shouldBeEqual(Down("a", "b", Reuse()), Down("a", Down("b")));
shouldBeEqual(Up("a", Down("a", Reuse())), Reuse());
shouldBeEqual(Down("a", Up("a", Reuse())), Reuse());

shouldBeEqual(Down(Offset(2, 9), Down(Offset(3, 4, 9))),
              Down(Offset(5, 4)));

shouldBeEqual(Up(Offset(3, 4, 9), Up(Offset(2, 9))),
              Up(Offset(5, 4)));

shouldBeEqual(Up(Offset(3), Down(Offset(3))), Reuse());
shouldBeEqual(Up(Offset(3, 5, 7), Down(Offset(2, 4, 7))), Up(Offset(1, 5, 4)));
shouldBeEqual(Up(Offset(3, 5, 7), Down(Offset(3, 4, 7))), Down(Offset(0, 4, 5)));
shouldBeEqual(Up(Offset(3, 5, 7), Down(Offset(4, 4, 7))), Down(Offset(1, 4, 5)));

shouldBeEqual(Down(Offset(3), Up(Offset(3))), Reuse());
shouldBeEqual(Down(Offset(3, 5, 7), Up(Offset(2, 5, 6))), Down(Offset(1, 6, 7)));
shouldBeEqual(Down(Offset(3, 5, 7), Up(Offset(3, 5, 6))), Down(Offset(0, 6, 7)));
shouldBeEqual(Down(Offset(3, 5, 7), Up(Offset(4, 5, 6))), Up(Offset(1, 7, 6)));


shouldBeEqual(Down(Offset(4), Up(Offset(3), Reuse())), Down(Offset(1)));
shouldBeEqual(Up(Offset(3), Down(Offset(4), Reuse())), Down(Offset(1)));
shouldBeEqual(Down(Offset(4), Up(Offset(5), Reuse())), Up(Offset(1)));
shouldBeEqual(Up(Offset(5), Down(Offset(4), Reuse())), Up(Offset(1)));

shouldBeEqual(apply(Down(Offset(2, 3)), "abcdefgh"), "cde");

shouldBeEqual(apply(Down(Offset(2, 5), Prepend(5, New("hello"), Up(Offset(2, 5, 2)))), "abcdefghijk"), "helloab");

shouldBeEqual(apply(Keep(3, Reuse({1: New(0)})), [0, 1, 2, 3, 4, 5]), [0, 1, 2, 3, 0, 5])
shouldBeEqual(apply(Keep(3, New("def")), "abcghi"), "abcdef");

shouldBeEqual(apply(Down(Offset(3)), [0, 1, 2, 3, 4, 5]), [3, 4, 5]);
shouldBeEqual(apply(Keep(3, New([Up(Offset(3), Down(0))])), [0, 1, 2, 3, 4, 5]), [0, 1, 2, 0]);

shouldBeEqual(apply(Reuse({a: Keep(3, Prepend(2, Up(Offset(3), "a", Down("b")), Remove(1)))}), {b: "XY", a: "abcdefghi"}), {b: "XY", a: "abcXYefghi"});

var x = apply(Reuse({x: UseResult(Up("x"))}), {a: 1});
shouldBeEqual(x.x.x.x.x.a, 1);
  
/*
function testSplitAt(count, editAction, expected, recordToTestOn) {
  let [left, right, inCount] = splitAt(count, editAction);
  shouldBeEqual([left, right, inCount], expected, "result of splitAt");
  let result1 = apply(Replace(expected[2], count, expected[0], expected[1]), recordToTestOn);
  let result2 = apply(editAction, recordToTestOn);
  shouldBeEqual(result1, result2, "invariant of splitAt");
}

testSplitAt(2, Reuse({0: Up(0, Down(1)), 1: Up(1, Down(3)), 2: New("b"), 3: Up(3, Down(0))}),
  [Reuse({0: Up(0, Down(1)), 1: Up(1, Down(3))}),
   Reuse({0: New("b"), 1: Up(3, Down(0))}),
   2],
  [5, 4, 3, 2, 1, 0]);

testSplitAt(2, New("abcdef"),
  [New("ab"),
   New("cdef"),
   0],
   "");

testSplitAt(2, New({0: Down(1), 1: New("a"), 2: Down(0), 3: Down(2)}, []),
  [New({0: Down(1), 1: New("a")}, []),
   New({0: Up(Offset(2), Down(0)), 1: Down(0)}, []),
   2],
  [5, 4, 3, 2, 1, 0]);

testSplitAt(2, Replace(3, 2, New("ab"), Reuse()),
  [New("ab"), Reuse(), 3], "");

testSplitAt(2, Replace(3, 3, Reuse({0: Up(0, Down(4)), 1: Up(1, Down(2)), 2: Up(2, Down(3))}), Reuse({0: Up(3, Down(1)), 1: Up(4, Down(5))})),
  [ Reuse({0: Up(0, Down(4)), 1: Up(1, Down(2))}),
    Replace(1, 1, Reuse({0: Up(2, Down(3))}), Reuse({0: Up(3, Down(1)), 1: Up(4, Down(5))})),
    2],
  [0, 1, 2, 3, 4, 5, 6, 7])

testSplitAt(4, Replace(3, 3, Reuse({0: Up(0, Down(4)), 1: Up(1, Down(2)), 2: Up(2, Down(3))}), Reuse({0: Up(3, Down(1)), 1: Up(4, Down(5))})),
  [ Replace(3, 3, Reuse({0: Up(0, Down(4)), 1: Up(1, Down(2)), 2: Up(2, Down(3))}), Reuse({0: Up(3, Down(1))})),
    Reuse({0: Up(4, Down(5))}),
    4],
  [0, 1, 2, 3, 4, 5, 6, 7])
*/

shouldBeEqual(
  andThen(Down(Offset(2)),
          Reuse({1: New(1), 3: Up(3, Down(0)), 4: Up(4, Down(3))})),
  Down(Offset(2), Reuse({1: Up(1, Offset(2), Down(0)), 2: Up(2, Offset(2), Down(3))})));

shouldBeEqual(
  andThen(Down(Offset(2, 2)),
          Reuse({1: New(1), 3: Up(3, Down(0)), 4: Up(4, Down(3))})),
  Down(Offset(2, 2), Reuse({1: Up(1, Offset(2, 2), Down(0))})));

shouldBeEqual(
  andThen(Down(Offset(1, 2)),
          Reuse({1: Up(1, Down(0)), 3: Up(3, Down(0)), 4: Up(4, Down(3))})),
  Down(Offset(1, 2), Reuse({0: Up(0, Offset(1, 2), Down(0))})));

shouldBeEqual(andThen(Down(1), Reuse({1: Up(1, Down(0))})),
  Down(0));

shouldBeEqual(andThen(Keep(2, Up(Offset(2))), Reuse({1: New(1), 3: Up(3, Down(0)), 4: Up(4, Down(3))})),
  Replace(2, 2, Reuse({1: New(1)}), Up(Offset(2), Reuse({1: New(1), 3: Up(3, Down(0)), 4: Up(4, Down(3))})))
  )

shouldBeEqual(andThen(Reuse({x: Reuse({y: Up("y", "x", Down("c"))})}), Reuse({c: Up("c", Down("x", "y", "z", Reuse()))})),
              Reuse({x: Reuse({y: Down("z", Reuse())}),
                     c: Up("c", Down("x", "y", "z", Reuse()))
              }))

shouldBeEqual(
  andThen(
  Reuse({a: Down("c")}),
  Reuse({a: Up("a", Down("b"))})),
  Reuse({a: Up("a", Down("b", Down("c")))}));

shouldBeEqual(
  andThen(
    Reuse({
    a: Reuse({
      c: Up("c", Up("a", Reuse({
        a: Reuse({
          d: New(1)})})))})}),
    Reuse({
    a: Up("a", Reuse())})),
  Reuse({
  a: Up("a", Reuse({
    c: Up("c", Reuse({
      a: Up("a", Reuse({
        d: New(1)}))}))}))}))

//{a: X, b: {c: {d: 1}}, e: 2}
//==>{a: {c: {d: 1}}, b: {c: {d: 1}}, e: 2}
//==>{a: {d: 2}, b: {c: {d: 1}}, e: 2}
shouldBeEqual(andThen(
  Reuse({
    a: Down("c", Reuse({
      d: Up("d", Up("c", Up("a", Down("e"))))}))}),
  Reuse({
    a: Up("a", Down("b"))})),
  Reuse({
    a: Up("a", Down("b", Down("c", Reuse({
      d: Up("d", Up("c", Up("b", Down("e"))))}))))}));

shouldBeEqual(apply(Replace(0, 1, New([Up(Offset(0, 0), Down(2))]), Reuse()), ["a", "b", "c", "d", "e"]), ["c", "a", "b", "c", "d", "e"]);

testAndThen(
  Replace(3, 1, Down(0), Reuse({1: New(5)})),
  Replace(2, 2, Reuse({0: New([Up(0, Offset(0, 2), Down(3))])}), New([1, 2, 3])),
  ["A", "B", "C", "D", "E", "F", "G", "H"]
);
// ["A", "B", |in "C", "D", "E", "F", "G", "H"]
// ==> [["D"]|out, "B", 1,|in 2, 3]
// ==> ["D",|out 2, 5]

shouldBeEqual(
  apply(Sequence(Reuse({b: Up("b", Down("c"))}), Reuse({a: Up("a", Down("b"))})), {a: 1, b: 2, c: 3}), {a: 3, b: 3, c: 3});

shouldBeEqual(
  andThen(
    Reuse({c: Up("c", Down("a"))}),
    Reuse({a: Sequence(Up("a", Down("b")),Reuse({d: New(1)}), {hd: {keyOrOffset: "a", prog: Reuse()}, tl: undefined})})
  ),
  Reuse({
  c: Up("c", Down("a", Sequence(
    Up("a", Down("b")),
    Reuse({
      d: New(1)}), List.fromArray([
    __ContextElem("a",Reuse(), Reuse())])))),
  a: Sequence(
    Up("a", Down("b")),
    Reuse({
      d: New(1)}), List.fromArray([
    __ContextElem("a",Reuse(), Reuse())]))})
)
  // [A,B,C,D,E,F,G,H]
  // [[D],B, 1, 2, 3]
  // [D, 5, 3]
 
// TODO, line 108, restore the Replace / Concat, no the inner Reuse
// ["a", "b",| "c", "d"]
// => ["d", "c",| "b", "a"]
// => ["b", "c", "d", "a"]

/*
apply(Down(Offset(2), Reuse({0: up(2 or 0?})), r, ctx)
= apply(Reuse({0, up(2 or 0)}), r[2,...[, (Offset(2), r)::ctx)
= apply(up(2), r[2], (2, r)::ctx)
*/
shouldBeEqual(andThen(
  Reuse({0: Up(0, Down(2)), 2: Up(2, Down(0))}),
  Replace(2, 2, Reuse(
    {0: Up(0, Offset(0, 2), Down(3)),
     1: Up(1, Offset(0, 2), Down(2))}),
             Reuse(
    {0: Up(0, Offset(2), Down(1)),
     1: Up(1, Offset(2), Down(0))}))),
  Replace(2, 2, Reuse(
    {0: Up(0, Offset(0, 2), Down(1)),
     1: Up(1, Offset(0, 2), Down(2))}), Reuse(
    {0: Up(0, Offset(2), Down(3)),
     1: Up(1, Offset(2), Down(0))})))


testAndThen(
  Reuse({0: Up(0, Down(2)), 2: Up(2, Down(0))}),
  Replace(2, 1, New([Up(Offset(0, 2), Down(4))]),
             Reuse({2: Up(2, Offset(2), Down(3))})),
  ["a", "b", "c", "d", "e"]);
/*==Replace(2, 1, New([Up(Offset(-2, 2), Down(1))]),Reuse({
    1: Up(1, Offset(2), Down(4)),
    2: Up(2, Offset(2), Down(3))}))
  */
  
/*
  Replace(2, 1, New([Up(Offset(0, 2), Down(3))]),
             Reuse({1: Up(1, Offset(2), Down(4)),
                    2: Up(2, Offset(2), Down(3))
             })))
*/
// [a, b|in, c, d, e]
// => [e|out, c, d, d]
// => [d, c, e, d]

testAndThen(
  Prepend(1, New([Down(0)])),
  Prepend(1, New([Down(5)])),
  ["a", "b", "c", "d", "e", "f"]
);
// = Prepend(1, New([Down(5)]),Prepend(1, Down(Offset(0, 0), New([Up(Offset(0, 0), Down(5))])),Reuse()))

testAndThen(
  Keep(2, Prepend(1, New([Up(Offset(2), Down(0))]), Reuse())),
  Prepend(1, New([Down(5)]), Reuse()),
  ["A", "B", "C", "D", "E", "F", "G"]
);

testAndThen(
  Keep(2, Replace(0, 1, New([Up(Offset(2, 0), Down(0))]), Reuse())),
  Replace(0, 1, New([Up(Offset(0, 0), Down(5))]), Reuse()),
  ["A", "B", "C", "D", "E", "F", "G"]
);

testAndThen(
  Keep(3, Replace(0, 1, New([Up(Offset(3, 0), Down(1))]), Reuse())),
  Keep(1, Replace(0, 1, New([Up(Offset(1), Down(5))]), Reuse())),
  ["A", "B", "C", "D", "E", "F", "G"]
); 

// TODO: Could optimize the result of andThen?
testAndThen(
  Reuse({a: Keep(3, Reuse({0: New(1)}))}),
  Reuse({a: Prepend(4, Up("a", Down("b")), Reuse())}),
  {a: [0, 1, 2, 3], b: [4, 5, 6, 7]});
/*
= Reuse({
  a: Prepend(3,
       Up("a", Down("b", Offset(0, 3))),
       Prepend(1,
         Up("a", Down("b", Offset(3), Reuse({
           0: New(1)}))),Reuse()))})

= it would be nice but probably hard to simplify to:

Reuse({
  a: Prepend(4,
       Up("a", Down("b", Offset(0, 4), Reuse({3: New(1)}))),
       Reuse())})
*/

testAndThen(
  Keep(3, Reuse({ 0: Up(0, Down(1))})),
  Reuse({0: Up(0, Down(1)),
         3: New(1),
         4: Up(4, Down(0))}),
  [0, 1, 2, 3, 4, 5, 6]);
/*
=Replace(3, 3,   --Concat(3, Down(Offset(0, 3), |), Down(Offset(3), |))
  Reuse({
    0: Up(0, Offset(0, 3), Down(1))}),
  Reuse({
    0: Up(0, Offset(3), Down(0)),
    1: Up(1, Offset(3), Down(0))}))

= it would be nice but probably hard to simplify to:

= Reuse({
    0: Up(0, Down(1))
    3: Up(3, Down(0))
    4: Up(4, Down(0))
    })),
*/

shouldBeEqual(
  andThen(
    Reuse({a: Keep(1, Prepend(2, New([8, 9])))}),
    Reuse({a: Concat(0, Up("a", Down("b")), New([1, 2]))})),
    Reuse({
  a: Concat(0, Up("a", Down("b")), New([1, 8, 9, 2]))})
);

/* // Todo: make it work.
shouldBeEqual(
  merge(
    Reuse({a: Up("a", Down("b", Create({x: Reuse(), c: Up("b", Down("a"))})))}),
    Reuse({a: Reuse({d: New(1)})})),
  Reuse({a: Up("a", Down("b", Create({x: Reuse(), c: Up("b", Down("a", Reuse({d: New(1)})))})))})
)*/

shouldBeEqual(
  merge(
    Replace(3, 3, New("abc"), Reuse()),
    Keep(2, New("def"))      
  ),
  Replace(2, 3,
    RemoveAll(Prepend(3, New("abc")), 3),
    New("def"))
);

shouldBeEqual(
  merge(
    Reuse({a: Insert("d", {b: Up("a", Down("c")), d: Reuse()})}),
    Reuse({a: New(3)})
  ),
  Reuse({a: Insert("d", {b: Up("a", Down("c")), d: New(3)})})
);

shouldBeEqual(
  merge(
    InsertAll({
      a: Reuse({
        b: New(3)})}),
    Reuse({
      b: Insert("e", {
        e: Reuse(),
        d: Up("b", Down("c"))})})
  ),
  InsertAll({
    a: Reuse({
      b: Insert("e", {
        e: New(3),
        d: Up("b", Down("c"))})})})
);

shouldBeEqual(
  merge(
    Reuse({a: New(1), c: Reuse({d: New(3)})}),
    Reuse({b: New(2), c: Reuse({e: New(4)})})
  ),
  Reuse({a: New(1), c: Reuse({d: New(3), e: New(4)}), b: New(2)})
);

shouldBeEqual(
  merge(
    RemoveExcept(Offset(2, 5), Reuse({4: New(1)})),
    RemoveExcept(Offset(3), Reuse({2: New(2), 5: New(3)})),
  ),
  RemoveExcept(Offset(3, 4), Reuse({2: New(2), 3: New(1)}))
);

shouldBeEqual(
  merge(
    Reuse({0: Up(0, Down(3))}),
    Keep(2, Remove(2))
  ),
  Replace(2, 2, Reuse({0: Up(0, Offset(0, 2), Down(3))}), Remove(2))
);

shouldBeEqual(
  merge(
    Keep(2, Remove(2)),
    Reuse({0: Up(0, Down(3))})
  ),
  Replace(2, 2, Reuse({0: Up(0, Offset(0, 2), Down(3))}), Remove(2))
);

shouldBeEqual(
  merge(
    Keep(5, Remove(1)),
    Remove(2)
  ),
  Remove(2, Keep(3, Remove(1)))
);

shouldBeEqual(
  merge(
    Remove(2),
    Keep(5, Remove(1))
  ),
  Remove(2, Keep(3, Remove(1)))
);

shouldBeEqual(
  merge(
    Reuse({c: Reuse({d: New(1)})}),
    Down("c")
  ),
  Down("c", Reuse({d: New(1)}))
);

shouldBeEqual(
  merge(
    Down("c"),
    Reuse({c: Reuse({d: New(1)})})
  ),
  Down("c", Reuse({d: New(1)}))
);

shouldBeEqual(
  merge(
    Replace(1, 2, New([1, Down(0)]), Reuse({2: Reuse({d: New(1)})})),
    Down(3)
  ),
  Down(3, Reuse({
    d: New(1)}))
);

shouldBeEqual(
  merge(
    Down(3),
    Replace(1, 2, New([1, Down(0)]), Reuse({2: Reuse({d: New(1)})}))
  ),
  Down(3, Reuse({
    d: New(1)}))
);

shouldBeEqual(
  merge(
    Replace(3, 2, New([1, Down(0)]), Reuse({0: New(1), 1: New(3)})),
    Down(Interval(1, 4))
  ),
  Down(Interval(1, 4), Replace(2, 0,
    RemoveAll(),
    Reuse({
      0: New(1)})))
);

shouldBeEqual(
  merge(
    Replace(3, 2, New([1, Down(0)]), Reuse({0: New(1), 1: New(3)})),
    Down(Offset(3, 1))
  ),
  Down(Offset(3, 1), Reuse({0: New(1)}))
);

shouldBeEqual(
  merge(
    Remove(1, Prepend(2, New([1, 2]), Reuse({1: Reuse({b: New(5)})}))),
    Replace(3, 3, Reuse({2: Reuse({c: New(6)})}), Prepend(1, New([2]), RemoveAll()))
  ),
  Remove(1, Prepend(2, New([1, 2]),
    Replace(2, 2,
      Reuse({
        1: Reuse({
          b: New(5),
          c: New(6)})}),
      Prepend(1, New([2]), RemoveAll()))))
);

shouldBeEqual(
  merge(
    Replace(3, 3, Reuse({2: Reuse({c: New(6)})}), New([2])),
    Remove(1, Prepend(2, New([1, 2]), Reuse({1: Reuse({b: New(5)})})))
  ),
  Remove(1,
  Prepend(2, New([1, 2]),
  Replace(2, 2,
    Reuse({1: Reuse({c: New(6), b: New(5)})}),
  New([2]))))
);

shouldBeEqual(
  merge(
    Prepend(2, "ab"),
    Remove(3)
  ),
  Prepend(2, "ab", Remove(3))
);

shouldBeEqual(
  merge(
    Keep(3, Prepend(2, "ab")),
    Remove(3)
  ),
  Remove(3, Prepend(2, "ab"))
);

shouldBeEqual(
  merge(
    Keep(2, Remove(2)),
    Keep(4, Reuse({
        0: Reuse({
          0: New(7)})}))
  ),
  Keep(2, Remove(2, 
      Reuse({
        0: Reuse({
          0: New(7)})})))
);

function testBackPropagate(e, u, res, name) {
  shouldBeEqual(backPropagate(e, u), res, name);
}

testBackPropagate(
  Concat(5, Reuse(), Reuse()),
  RemoveAll(Prepend(1, "a")),
  Prepend(2, "aa", RemoveAll())
);

testBackPropagate(
  Concat(5, Reuse(), Reuse()),
  Prepend(1, "a", Keep(5, Prepend(1, "b"))),
  Prepend(2, Choose("ab", "ba"))
);

testBackPropagate(
  Down("a", "b"),
  Choose(New(1), New(2)),
  Choose(Reuse({a: Reuse({b: New(1)})}),
         Reuse({a: Reuse({b: New(2)})})));

testBackPropagate(
  Reuse(), Reuse({b: New(1)}),
  Reuse({b: New(1)})
)

testBackPropagate(
  Down("b"), New(1),
  Reuse({b: New(1)})
)

testBackPropagate(
  New({a: Reuse()}), Reuse({a: New(1)}),
  New(1)
);

testBackPropagate(
    Reuse({a: New({x: Down("z")})}),
    Reuse({b: Up("b", Down("a"))})
  ,
  Reuse({b: Up("b", Down("a", New({x: Down("z")})))})
);

testBackPropagate(
  
    Down("b", Reuse({a: Down("c", Reuse({d: Up("d", Up("c", Down("e")))}))})), Reuse({a: Reuse({d: New(1)})}),
  Reuse({b: Reuse({a: Reuse({e: New(1)})})})
)

testBackPropagate(
  Down("x", "b", Reuse({
    a: Up("a", "b", Down("c"))})),
  New({
    wrap: New({
      wrap2: Reuse({
        a: New({
          d: Reuse()})})})}),
  Reuse({
    x: Reuse({
      b: New({
        wrap: New({
          wrap2: Reuse()})}),
      c: New({d: Reuse()})
  })})
)

testBackPropagate(
  Reuse({a: Up("a")}), New({b: Down("a")}),
  New({b: Reuse()})
)

testBackPropagate(
  Reuse({a: Up("a", Down("b"))}), New({b: Down("a")}),
  New({b: Down("b")})
)

testBackPropagate(
  Reuse({a: Down("x")}), New({b: Down("a")}),
  New({b: Down("a", "x")})
);

testBackPropagate(
  New({a: Down("x")}), New({b: Down("a")}),
  New({b: Down("x")})
);

testBackPropagate(
  New({a: Down("x", Reuse({b: Down("c", Reuse({d: 1}))}))}), New({b: Down("a", "b")}),
  New({b: Down("x", "b", "c")})
);

testBackPropagate(
  Reuse({a: Up("a", Down("b"))}),
    Reuse({a: Reuse({c: New(1)})}),
  Reuse({b: Reuse({c: New(1)})})
);

testBackPropagate(
  Down(Offset(2)),
    Prepend(3, New("abc")),
  Keep(2, Prepend(3, New("abc"))),
  "Prepend after deletion with Down"
);

testBackPropagate(
  Reuse({a: Down("c")}),
    New({x: Down("a", New({y: Up("a", Down("b"))}))}),
  New({x: New({y: Down("b")})})
);

testBackPropagate(
  Reuse({a: Down("c"), b: Down("e")}),
    Reuse({a: New({x: New({y: Up("a", Down("b", Reuse({d: New(1)})))})})}),
  Reuse({a: Reuse({c: New({x: New({y: Up("c", "a", Down("b", "e"))})})}),
    b: Reuse({e: Reuse({d: New(1)})})
  })
);

testBackPropagate(
  Reuse({a: Down("b", Reuse({c: Down("d")}))}),
    Reuse({a: Reuse({c: Up("c", Down("e"))})}),
  Reuse({a: Reuse({b: Reuse({c: Reuse({d: Up("d", "c", Down("e"))})})})})
)

testBackPropagate(
  Prepend(1, New("a")),
    Keep(2, Prepend(3, New("abc"))),
  Keep(1, Prepend(3, New("abc")))
);

testBackPropagate(
  Reuse({c: Down(Offset(10))}),
    Reuse({b: Up("b", Down("c", Remove(5)))}),
  Reuse({
  b: Up("b", Down("c", Offset(15)))})
);

testBackPropagate(
  Reuse({c: Down(Offset(10))}),
    Reuse({c: Remove(5)}),
  Reuse({
  c: Keep(10, Remove(5))})
);

testBackPropagate(
  Reuse({c: Remove(3), x: Remove(2)}),
    Reuse({d: Concat(2, Up("d", Down("c", Remove(5))), Up("d", Down("x", Keep(7, Remove(3)))))}),
  Reuse({
  d: Concat(2, Up("d", Down("c", Interval(8))), Up("d", Concat(7, Down("x", Interval(2, 9)), Down("x", Interval(12)))))})
);

testBackPropagate(
  Reuse({a: New({x: Reuse({z: New(2)}), y: New(2)})}),
    Reuse({b: Up("b", Down("a"))}),
  Reuse({b: Up("b", Down("a", New({x: Reuse(), y: New(2)})))})
)

testBackPropagate(
  Remove(2),
  Prepend(3, "abc"),
  Keep(2, Prepend(3, "abc")),
  "Prepend after deletion"
);

testBackPropagate(
  Keep(2, Remove(2)),
  Keep(2, Prepend(3, "abc")),
  Keep(4, Prepend(3, "abc")),
  "Prepend to the right of a deletion"
);

testBackPropagate(
  Keep(2, Remove(2)),
  Replace(2, 5, Keep(2, Prepend(3, "abc")), Reuse()),
  Keep(2, Prepend(3, "abc")),
  "Prepend to the left of a deletion"
);

testBackPropagate(
  Replace(3, 3, Reuse({0: Up(0, Down(1))}), Reuse({1: Up(1, Down(0))})),
    RemoveExcept(Offset(2, 1)),
  Remove(2, Keep(1, RemoveAll()))
);

testBackPropagate(
  Replace(3, 3,
    Reuse({0: Up(0, Down(1))}),
    Reuse({1: Up(1, Down(0))})),
    RemoveExcept(Offset(2, 2)),
  Remove(2, Keep(2, RemoveAll()))
);

testBackPropagate(
  Keep(2, Remove(1)),
    Remove(3),
  Remove(2, Keep(1, Remove(1)))
);

testBackPropagate(
  Reuse({a: Remove(2)}),
    Reuse({a: Remove(3)}),
  Reuse({a: Keep(2, Remove(3))})
);

// ["a", "b", "c", "d", ["e"], "f", "g"]
// -> ["c", "d", "e", "f",|out "a",|in "b"]
// =>           [7,    2,      "a"]
// ==> Removed["c","d"], replaced "e" by 7 and "f" by 2, removed ["g"]
// => Keep(2, Remove(2, Replace(2, 2, Reuse({0: Reuse({0: New(7)}), 1: New(2)}), RemoveAll())))
testBackPropagate(
  Remove(2, Replace(4, 4, Reuse({2: Down(0)}), Up(Offset(6), Down(Offset(0, 2))))),
    Remove(2, Replace(3, 3, Reuse({0: New(7), 1: New(2)}), RemoveAll())),
  Keep(1, Remove(3, Reuse({
    0: Reuse({
      0: New(7)}),
    1: New(2)}))));

ea = Reuse({a: Custom(Up("a", New([Down("x"), Down("y")])),
{
  name: "Addition",
  apply: ([x, y]) => x + y,
  update: (newEdit, oldInput, oldOutput) => {
    if(isIdentity(newEdit)) return newEdit;
    if(newEdit.ctor == editActions.Type.New) {
      return Reuse({0: newEdit.model.value - oldInput[1]});
    }
  }
})});
apply(ea, {a: 0, x: 1, y: 2}) // Just for caching.

testBackPropagate(
  ea,
    Reuse({a: New(5)}),
  Reuse({x: 3})
);

testBackPropagate(
  Remove(2, Replace(4, 4, Reuse({2: Down(0)}), Up(Offset(2)))),
  Replace(3, 3, RemoveExcept(Offset(2, 1, 3), Reuse({0: New(7)})), Reuse()),
    Keep(2, Remove(2, Reuse({
    0: Reuse({
      0: New(7)})})))
)

testBackPropagate(
  Reuse(),
    Keep(1, Remove(3, Keep(1, Remove(2)))),
  Keep(1, Remove(3, Keep(1, Remove(2))))
)

// TODO: It won't work with strings
// That's because the Remove makes it so it thinks he has to recover the value of the Replace, instead of trying to back-propagate the Replace. Here, the Replace should be like Reuse and stop the building of the edit action, and give it back to back-propagation.
testBackPropagate(
  Remove(3, Keep(2, Remove(2))),
    Keep(1, Remove(3, Keep(1, Remove(2)))),
  Keep(4, Remove(1, Keep(2, Remove(2, Keep(1, Remove(2))))))
)

testBackPropagate(
  Remove(5),
  RemoveExcept(Offset(0, 2)),
  Keep(7, RemoveAll()),
  "slice back-propagation"
);

testBackPropagate(
  Remove(5),
  RemoveExcept(Offset(2, 4)),
  Keep(5, Remove(2, Keep(4, RemoveAll()))),
  "slice back-propagation bis"
);
testBackPropagate(
  Remove(5),
  Remove(2, Keep(2, RemoveAll())),
  Keep(5, Remove(2, Keep(2, RemoveAll()))),
  "slice back-propagation bis"
);

step = Keep(5,  // "Hello"
      Replace(6, 22,                      // " world"
        Prepend(16,
          New(" big world, nice"),   // prepend
          Reuse()                    // " world"
        ),
      Keep(2, // The string "! "
      Prepend(1, "?" // The inserted string "?"
      ))));
shouldBeEqual(apply(step, "Hello world! ?"), "Hello big world, nice world! ??")

testBackPropagate(
  Down(Offset(5, 4)),
  Down(Offset(0, 2)),
  Keep(5, Replace(4, 2,
    Down(Offset(0, 2, 4)),
    Reuse())),
  "slice back-propagation 2"
);

testBackPropagate(
  Down(Offset(5, 4)),
  Down(Offset(2)),
  Keep(5, Replace(4, 2,
    Down(Offset(2, 2, 4)),
    Reuse())),
  "slice back-propagation 3"
);
testBackPropagate(
  Reuse({a: Up("a", Down("b", Offset(5)))}),
  Reuse({a: Down(Offset(0, 2))}),
  Reuse({b: Keep(5, Down(Offset(0, 2)))}),
  "Slice backprop with up down"
);
testBackPropagate(
  Reuse({a: Down(Offset(5))}),
  Reuse({b: Up("b", Down("a", Offset(0, 2-0)))}),
  Reuse({b: Up("b", Down("a", Offset(5, 7-5)))}),
  "Slice backprop with up down"
);
testBackPropagate(
  Down("b", Offset(2, 5)),
  Down(Offset(3, 2)),
  Reuse({
  b: Keep(2, Replace(5, 2,
      Down(Offset(3, 2, 5)),
      Reuse()))}),
  "Slice backprop with one down"
);
testBackPropagate(
  Down("b", Offset(2, 5)),
  Remove(3),
  Reuse({b: Keep(2, Remove(5-2))}),
  "Slice backprop with one down 2"
);

// In this case, we modify the array on-place, so we back-propagate the modification.

testBackPropagate(
  Reuse({a: Concat(5,
    Up("a", Down("b", Offset(2, 7-2))),
    Down(Offset(4, 6-4)))}),
  Reuse({a: Remove(3, Keep(3, RemoveAll()))}),
  Reuse({a: Keep(5, Remove(6-5)),
         b: Keep(2, Remove(5-2))}),
  "Case Concat Reuse Slice 1"
);

testBackPropagate(
  Reuse({a: Concat(5,
    Up("a", Down("b", Offset(2, 5))),
    Down(Offset(4, 2)))}),
  Reuse({a: Remove(3, Keep(3, RemoveAll()))}),
  Reuse({a: Keep(5, Remove(1)),
         b: Keep(2, Remove(3))}),
  "Case Concat Reuse Slice 1 strict"
);
testBackPropagate(
  Reuse({a: Up("a", Down("b", Remove(2, Keep(5, RemoveAll()))))}),
  Reuse({c: Up("c", Down("a", Offset(3, 5-3)))}),
  Reuse({c: Up("c", Down("b", Offset(5, 7-5)))}),
  "Case Concat Reuse Slice 2 premise"
);
testBackPropagate(
  Reuse({a: Remove(4, Keep(2, RemoveAll()))}),
  Reuse({c: Up("c", Down("a", Offset(0, 1-0)))}),
  Reuse({c: Up("c", Down("a", Interval(4, 5)))}),
  "Case Concat Reuse Slice 2 premise 2"
);
// In this case, we import another array, so we just need to find how to import the same array in the program.
testBackPropagate(
  Reuse({a: Concat(5,
    Up("a", Down("b", Remove(2, Keep(5, RemoveAll())))),
    Remove(4, Keep(2, RemoveAll())))}),
  Reuse({c: Up("c", Down("a", Offset(3, 3)))}),
  Reuse({
  c: Up("c", Down("a", Concat(2, Up("a", Down("b", Interval(5, 7))), Down(Interval(4, 5)))))}),
  "Case Concat Reuse Slice 2"
);
// Problem: Instead of keeping the "slice" from which we obtained "b" for "c", it instead back-propagates the Remove action to b (remove elements 2 to 5) and reuse b and apply the removal.
// The problem is that it makes sense, but it's not what we want.
// Are Slice and Remove different?
// We took a portion of b, we removed 2 to 5 to it as well as stopped at 8 (but we did not know that the two elements were removed in the view)
// We took a portion of c, we removed everything except the first element, which was actually the fourth element of c.

testBackPropagate(
  Concat(4, Down(Offset(0, 4-0)),
         Down(Offset(5))),
  Keep(2, RemoveAll()),
  Keep(2, Remove(4-2, Keep(5-4, RemoveAll()))), "Reinject the omitted element"
);
testBackPropagate(
  Concat(4, Down(Offset(0, 4-0)),
         Down(Offset(5))),
  RemoveExcept(Offset(6, 8-6)),
  Remove(4, Keep(1, Remove(2, Keep(2, RemoveAll())))), "Shifted slice"
);
testBackPropagate(
  Concat(4, Down(Offset(0, 4-0)),
         Down(Offset(5))),
  RemoveExcept(Offset(2, 8-2)),
  Remove(2, Keep(7, RemoveAll())), "Spanning slice"
);
testBackPropagate(
  Reuse({a: Concat(4, Up("a", Down("b", Offset(0, 4-0))),
    Down(Offset(5)))}),
  Reuse({a: RemoveExcept(Offset(6, 8-6))}),
  Reuse({
    b: Remove(4),
    a: Keep(5, Remove(7-5, Keep(9-7, RemoveAll())))}),
  "Shifted slice on separate branches"
);

testBackPropagate(
  Reuse({a: Concat(4, Concat(2, Up("a", Down("b", Offset(1, 3-1))), Up("a", Down("c", Offset(0, 2-0)))),
    Down(Offset(5)))}),
  Reuse({a: RemoveExcept(Offset(6, 8-6))}),
  Reuse({
    b: Keep(1, Remove(3-1)),
    c: Remove(2),
    a: Keep(5, Remove(7-5, Keep(9-7, RemoveAll())))}),
  "Shifted slice on separate branches"
);

testBackPropagate(
  Keep(4, Prepend(1, New("X"))),
  Remove(6, Keep(2, RemoveAll())),
  Remove(5, Keep(2, RemoveAll())), "Shifted slice again"
);
testBackPropagate(
  Keep(4, Remove(1)),
  Remove(6, Keep(2, RemoveAll())),
  Remove(4, Keep(1, Remove(2, Keep(2, RemoveAll())))), "Shifted slice again"
);
testBackPropagate(
  Keep(4, Remove(5-4)),
  Keep(1, Remove(2-1, Keep(3-2, RemoveAll()))),
  Keep(1,Remove(2-1,Keep(3-2,Remove(4-3,Keep(5-4, RemoveAll()))))),
  "right-aligned concat."
);
testBackPropagate(
  Concat(4, Down(Offset(0, 4-0)),
         Down(Offset(5))),
  Keep(2, Remove(6-2, Keep(8-6, RemoveAll()))),
  Keep(2,Remove(4-2,Keep(5-4,Remove(7-5,Keep(9-7, RemoveAll()))))),
  "back-Propagation of bigger concat"
);

testBackPropagate(
  Down(Offset(5)),
  RemoveExcept(Offset(2)),
  Keep(5, Remove(7-5)),
  "slice back-propagation"
)

testBackPropagate(
  Down(Offset(5, 9-5)),
  RemoveExcept(Offset(2)),
  Keep(5, Remove(7-5)),
  "slice back-propagation"
)

testBackPropagate(
  Concat(4, Down(Offset(0, 4-0)),
            Down(Offset(5))),
  Down(Offset(0, 6)),
  Concat(4, Down(Interval(0, 4)), Down(Interval(5, 7))), "Concat to slice");

testBackPropagate(
  Keep(4, Remove(1)),
  RemoveExcept(Interval(0, 6), Reuse({5: New(1)})),
  Replace(7, 7,
    Reuse({
      6: New(1)}),
    RemoveAll()), "Concat to slice");

testBackPropagate(
  Keep(4, Remove(1)),
  Keep(6, Prepend(1, New("\""))),
  Keep(7, Prepend(1, New("\"")))
  , "Concat Iterated");

testBackPropagate(
  Remove(3, Keep(2, Remove(2))),
  Keep(1, Remove(3, Keep(1, Remove(2)))),
  Keep(4, Remove(1, Keep(2, Remove(2, Keep(1, Remove(2))))))
);

shouldBeEqual(
  andThen(
    Remove(2, Keep(1, RemoveAll())),
    Remove(2, Keep(3, RemoveAll()))
  ),
  RemoveExcept(Interval(4, 5), Keep(1, RemoveAll()))
);

shouldBeEqual(
  merge(
    Remove(1, Keep(4, RemoveAll())),
    Remove(3)
  ),
  Remove(3, Keep(2, RemoveAll()))
);

shouldBeEqual(
  merge(
    Remove(3),
    Remove(1, Keep(4, RemoveAll()))
  ),
  Remove(3, Keep(2, RemoveAll())),
"merge remove portions 1");

shouldBeEqual(
  Concat(3, New("abc"),New("de")), New("abcde")
);

shouldBeEqual(
  Concat(3, New([1, 2, 3]),New([4, 5])), New([1, 2, 3, 4, 5])
);

shouldBeEqual(
  Down(Offset(0, 2), Offset(0, 1)),
  Down(Offset(0, 1))
  , "remove #1"
);


shouldBeEqual(
  Down(Offset(1), Offset(2)),
  Down(Offset(3))
  , "remove #2"
);
shouldBeEqual(
  andThen(Keep(1, Remove(3)), Keep(2, Remove(2))), Replace(2, 1,
  Keep(1, RemoveAll()),
  Remove(4)), "remove #5"
);

shouldBeEqual(
  merge(
    Remove(1, Replace(4, 4, Reuse({0: New(0), 3: New(2)}), RemoveAll())),
    Remove(3, Replace(5, 5, Reuse({0: New(1), 4: New(3)}), RemoveAll()))),
    Remove(3, Replace(2, 2, Reuse({0: New(1), 1: New(2)}), RemoveAll())), "Merge two slices 1");

shouldBeEqual(
  merge(Remove(3, Replace(5, 5, Reuse({0: New(1), 4: New(3)}), RemoveAll())),
    Remove(1, Replace(4, 4, Reuse({0: New(0), 3: New(2)}), RemoveAll()))),
  Remove(3, Replace(2, 2, Reuse({0: New(1), 1: New(2)}), RemoveAll())), "Merge two slices 2");

shouldBeEqual(
  merge(
    Remove(1, Replace(4, 4, Reuse({0: New(0), 3: New(2)}), RemoveAll())),
    Remove(3, Reuse({0: New(1), 4: New(3)}))),
  Remove(3, Replace(2, 2, Reuse({0: New(1), 1: New(2)}), RemoveAll())), "Merge two slices 3");

shouldBeEqual(
  merge(
    Remove(3, Reuse({0: New(1), 4: New(3)})),
    Remove(1, Replace(4, 4, Reuse({0: New(0), 3: New(2)}), RemoveAll()))),
  Remove(3, Replace(2, 2, Reuse({0: New(1), 1: New(2)}), RemoveAll())), "Merge two slices 4");

testMergeAndReverse(
  Remove(1, Prepend(1, New("\""))),
  Keep(1, Remove(1, Prepend(1, New("\"")))),
  Remove(1, Prepend(1, New("\""), Remove(1, Prepend(1, New("\"")))))
);

testMergeAndReverse(
  Remove(1, Keep(4, RemoveAll())),
  Remove(6),
  RemoveExcept(Interval(6, 6)), "Merge two slices 5");

testMergeAndReverse(
  Remove(5),
  Remove(3, Keep(4, RemoveAll())),
  Remove(5, Keep(2, RemoveAll())), "Merge two slices 7");

testMergeAndReverse(
  Remove(5), Remove(3),
  Remove(5), "Merge two slices 9");
testMergeAndReverse(
  Remove(3), Remove(5),
  Remove(5), "Merge two slices 10");

testMergeAndReverse(
  Remove(5), Replace(4, 3, New("abc"), Reuse()),
  Remove(5), "prepend removed");

testMergeAndReverse(
  Remove(5),
  Keep(5, Replace(0, 3, New("abc"), Reuse())),
  Remove(5, Replace(0, 3, New("abc"), Reuse())), "prepend kept"
);
testMergeAndReverse(
  Remove(5),
  Keep(7, Prepend(3, "abc")),
  Remove(5, Keep(2, Prepend(3, "abc"))),
"prepend not removed"
);

testMergeAndReverse(
  Remove(4, Prepend(8, New("inserted"))),
  Remove(3),
  Remove(4, Prepend(8, New("inserted"))), "merge concat Remove");

testMerge(
  Prepend(3, New("abc")),
  Prepend(2, Down(Offset(3, 2)), RemoveExcept(Offset(0, 3))),
  Choose(
    Prepend(3, New("abc"), Prepend(2, Down(Interval(3, 5)), RemoveExcept(Interval(0, 3)))),
    Prepend(2, Down(Interval(3, 5)), Prepend(3, New("abc"), RemoveExcept(Interval(0, 3))))),
  "Permutation and prepend 1");

testMergeAndReverse(
    Prepend(8, New("inserted"), Remove(1)),
    Keep(4, Prepend(9, New("inserted2"))),
    Prepend(8, New("inserted"), Remove(1, Keep(3, Prepend(9, New("inserted2"))))), "merge concat concat 1");

shouldBeEqual(
  merge(
    Keep(5, Remove(2)),
    Keep(2, Remove(2))),
  Keep(2, Remove(2, Keep(1, Remove(2)))),
  "Merge of two deletions"
);

testMergeAndReverse(
  Keep(8, New("abc")),
  Replace(9, 8, Remove(1), RemoveExcept(Offset(0, 1))),
  Replace(8, 7,
  RemoveExcept(Interval(1, 8)),
  New("abc")),
  "Permutation and prepend again"
);

shouldBeEqual(
  merge(Keep(5, Remove(3)),
        Keep(7,
          Prepend(3, New("abc")))),
  Keep(5, Remove(3))
);

shouldBeEqual(Down("a", "b", Up("b", "a")), Reuse(), "path1");
shouldBeEqual(Up("b", "a", Down("a", "b")), Reuse(), "path2");
shouldBeEqual(Up("b", "a", Down("a", "c")), Up("b", Down("c")), "path3");
shouldBeEqual(Down("a", "c", Up("c", Down("b"))), Down("a", "b"), "path4");
shouldBeEqual(Down("a", Up("a", "b")), Up("b"), "path5");
shouldBeEqual(Down("a", Up("a", "b", "c")), Up("b", "c"), "path5b");
shouldBeEqual(Down("a", "b", "c", Up("c", "b")), Down("a"), "path6");
shouldBeEqual(Up("a", "b", Down("b")), Up("a"), "path7");
shouldBeEqual(Up("c", "b", Down("b", "c", "a")), Down("a"), "path8");

var exp1 =
  { ctor: "let1",
    argName: "a",
    arg:
    { ctor: "fun2",
      argName: "x",
      body:
      { ctor: "let3",
        argName: "b",
        arg:
        { ctor: "app4",
          fun: "x",
          arg: "x"},
        body:
        { ctor: "app5",
          fun: "b",
          arg: "w"}}},
    body:
    { ctor: "let6",
      argName: "b",
      arg:
      { ctor: "let7",
        argName: "c",
        arg:
        { ctor: "fun8",
          argName: "y",
          body:   
          { ctor: "var9",
            name: "y"}},
        body:
        { ctor: "let10",
          argName: "d",
          arg:
          { ctor: "fun11",
            argName: "z",
            body:
            { ctor: "var12",
              name: "z"}},
          body:
          { ctor: "app13",
            fun: "c",
            arg: "d"}}},
      body:
      { ctor: "app14",
        fun: "a",
        arg: "b"}}};
var globalStep1 = Reuse(
         {body: Down("arg", Reuse(
           {body: Up("body", "arg", Down("arg", "body", Reuse( 
             {body: Up("body", "body", "arg", Reuse(
               {arg: Up("arg", Down("arg", "arg", "body", Reuse(
                 {name: Up("name", "body", "arg", "arg", Down("arg", "body", "body", "arg"))}))),
                body: Up("body", "body", Down( "arg", "body", Reuse(
                 {argName: New("a"),
                  arg: Reuse({fun: Up("fun", "arg", "body", "arg", Down( "body", "body", "arg")),
                              arg: Up("arg", "arg", "body", "arg", Down( "body", "body", "arg"))}),
                  body: Reuse({fun: New("a")})})))}))})))}))});
var step = Reuse(
         {body: Reuse(
           {body: Reuse(
             {body: Down("body", Reuse(
               {arg: Reuse(
                 {fun: Up("fun", "arg", "body", Down( "arg", "name")),
                  arg: Up("arg", "arg", "body", Down( "arg", "name"))})}))})})});

var globalStep2 = Reuse(
  {body: Down("arg", Reuse(
    {body: Reuse(
      {body: Up("body", "body", "arg", "body", Down( "arg", "body", Reuse(
        {arg: Reuse(
          {fun: Up("fun", Up("arg", "body", "arg", Down("body", "arg", "body", "body", "arg"))),
           arg: Up("arg", Up("arg", "body", "arg", Down("body",/*+>*/ "arg", "body", "body", "arg")))}),
         argName: New("a"),
         body: Reuse({fun: New("a")})})))})}))});

var expBeforeStep = apply(globalStep1, exp1);
shouldBeEqual(expBeforeStep,
  { ctor: "let1",
    argName: "a",
    arg:
    { ctor: "fun2",
      argName: "x",
      body:
      { ctor: "let3",
        argName: "b",
        arg:
        { ctor: "app4",
          fun: "x",
          arg: "x"},
        body:
        { ctor: "app5",
          fun: "b",
          arg: "w"}}},
     body:
     { ctor: "let7",
       argName: "c",
       arg:
       { ctor: "fun8",
         argName: "y",
         body:
         { ctor: "var9",
           name: "y"}},
       body:
       { ctor: "let10",
         argName: "d",
         arg:
         { ctor: "fun11",
           argName: "z",
           body:
           { ctor: "var12",
             name: "z"}},
         body:
         { ctor: "let6",
           argName: "b",
           arg:
           { ctor: "var9",
             name: "d"},
           body:
           { ctor: "let3",
             argName: "a",
             arg:   { ctor: "app4", fun: "b", arg: "b"},
             body:   { ctor: "app5", fun: "a", arg: "w"}}}}}});
var expAfterStep = apply(step, expBeforeStep);
var expectedExpAfterStep =
  { ctor: "let1",
    argName: "a",
    arg: 
    { ctor: "fun2",
      argName: "x",
      body:
      { ctor: "let3",
        argName: "b",
        arg:
        { ctor: "app4",
          fun: "x",
          arg: "x"},
        body:
        { ctor: "app5",
          fun: "b",
          arg: "w"}}},
    body:
    { ctor: "let7",
      argName: "c",
      arg:
      { ctor: "fun8",
        argName: "y",
        body:
        { ctor: "var9",
          name: "y"}},
      body:
      { ctor: "let10",
        argName: "d",
        arg:
        { ctor: "fun11",
          argName: "z",
          body:
          { ctor: "var12",
            name: "z"}},
        body:
        { ctor: "let3",
          argName: "a",
          arg:
          { ctor: "app4",
            fun: "d",
            arg: "d"},
          body:
          { ctor: "app5",
            fun: "a",
            arg: "w"}}}}}
shouldBeEqual(expAfterStep, expectedExpAfterStep);

var expAfterGlobalStep2 = apply(globalStep2, exp1);
shouldBeEqual(expAfterGlobalStep2, expectedExpAfterStep);
shouldBeEqual(
 andThen(
   step,
   globalStep1),
  globalStep2);

shouldBeEqual(
  andThen(
    Reuse({body: Up("body")}),
    New({ body: Down("a", "b")})
  ),
  New({ body: New({ body: Down("a", "b")})})
);

shouldBeEqual(
  andThen(
    Reuse({body: Reuse({fun: Up("fun", "body", Down("arg"))})}),
    New({ 
      arg: Down("c"),
      body: Reuse({fun: Up("fun")})})
  ),
  New({ 
      arg: Down("c"),
      body: Reuse({fun: Up("fun", Down( "c"))})})
);

shouldBeEqual(
  andThen(
    Reuse({body: Reuse({fun: Reuse({fun2: Up("fun2", "fun", "body", Down("arg"))})})}),
    New({ 
      arg: Down("c"),
      arg2: Down("d"),
      body: Reuse({fun: Reuse({ fun2: Up("fun2", "fun", Reuse({arg2: Up("arg2")}))})})})
  ),
  New({ 
      arg: Down("c"),
      arg2: Down("d"),
      body: Reuse({fun: Reuse({ fun2: Up("fun2", "fun", Down("c"))})})})
);

shouldBeEqual(
  andThen(
    Reuse({body: Reuse({fun: Up("fun", "body", Down("arg"))})}),
    New({ 
      arg: Down("c"),
      body: Down("a")})
  ),
  New({ 
      arg: Down("c"),
      body: Down("a", Reuse({fun: Up("fun", "a", Down("c"))}))})
);

shouldBeEqual(
  andThen(
    Reuse({body: Reuse({fun: Up("fun", "body", Down("arg"))})}),
    New({ 
      arg: Down("c"),
      body: Down("a", "b")})
  ),
  New({ 
      arg: Down("c"),
      body: Down("a", "b", Reuse({fun: Up("fun", "b", "a", Down("c"))}))})
);

shouldBeEqual(
  andThen(
    Reuse({body: Reuse({fun: Up("fun", "body", Down("arg"))})}),
    New({ 
      arg: Down("c"),
      body: Down("a", "b")})
  ),
  New({ 
      arg: Down("c"),
      body: Down("a", "b", Reuse({fun: Up("fun", "b", "a", Down("c"))}))})
);

shouldBeEqual(
  andThen(
    Reuse({c: Reuse({e: Reuse({f: Up("f", "e", "c", Down("a"))})})}),
    New({a: Down("b"), c: Down("d")})),
  New({a: Down("b"), c: Down("d", Reuse({e: Reuse({f: Up("f", "e", "d", Down("b"))})}))}));

shouldBeEqual(
  andThen(
    Reuse({c: Reuse({e: Up("e", "c", Down("a"))})}),
    New({a: Down("b"), c: Down("d")})),
  New({a: Down("b"), c: Down("d", Reuse({e: Up("e", "d", Down("b"))}))}));

shouldBeEqual(
  andThen(
    Reuse({
      body: Reuse({
        fun: Reuse({
          fun: Up("fun", "fun", "body", Down("arg")),
          arg: Up("arg", "fun", "body", Down("arg"))})})}),
    New({ ctor: "let",
      argName: Down("fun", "argName"),
      arg: Down("arg", "arg"),
      body: Down("fun", "body")})
  ),
  New({ ctor: "let",
      argName: Down("fun", "argName"),
      arg: Down("arg", "arg"),
      body: Down("fun", "body", Reuse({
        fun: Reuse({
          fun: Up("fun", "fun", "body", "fun", Down("arg", "arg")),
          arg: Up("arg", "fun","body","fun", Down("arg", "arg"))})}))})
);


shouldBeEqual(
  andThen(
    Down("fun", "body", Reuse({fun: Reuse({fun: Up("fun", "fun", "body", "fun", Down("arg")),
                                      arg: Up("arg", "fun", "body", "fun", Down("arg"))})})),
    Reuse({arg: Down("arg")})
  ),
  Down("fun", "body", Reuse({fun: Reuse({fun: Up("fun", "fun", "body", "fun", Down("arg", "arg")),
                                    arg: Up("arg", "fun", "body", "fun", Down("arg", "arg"))})}))
)

shouldBeEqual(
  apply(Down(Interval(3, 7)), [0, 1, 2, 3, 4, 5, 6, 7, 8]),
  [3, 4, 5, 6],
  "Slice"
);

shouldBeEqual(
  apply(Concat(2, Down(Offset(3, 5-3)), Down(Offset(6, 7-6))), [0, 1, 2, 3, 4, 5, 6, 7, 8]),
  [3, 4, 6],
  "Concat normal"
)

shouldBeEqual(
  apply(Concat(2, Down(Offset(3, 5-3)), Concat(1, Down(Offset(6, 7-6)), Down(Offset(0, 2-0)))), [0, 1, 2, 3, 4, 5, 6, 7, 8]),
  [3, 4, 6, 0, 1],
  "Concat multiple"
)

shouldBeEqual(
  andThen(Concat(1, New([1]), Reuse()), Down(Offset(1))),
  Down(Interval(1), Concat(1, New([1]), Reuse())),
  "Prepend Down"
)

shouldBeEqual(
  andThen(Down(Offset(1)), Concat(1, New([1]), Reuse())),
  Reuse(),
  "Reversible Concat"
);

shouldBeEqual(
  andThen(Concat(3, Down(Offset(2, 5-2)), Down(Offset(0, 2-0))),
          Concat(2, Down(Offset(3, 5-3)), Down(Offset(0, 3-0)))),
  Down(Offset(0, 5-0)),
  "Simplification of two anti-permutations"
);

shouldBeEqual(
  andThen(Concat(3, Down(Offset(2, 5-2)), Down(Offset(0, 2-0))),
          Concat(3, Down(Offset(2, 5-2)), Down(Offset(0, 2-0)))),
  Concat(1, Down(Offset(4, 5-4)), Down(Offset(0, 4-0))),
  "Simplification of permutations"
);


testBackPropagate(
  Keep(4, Remove(1, Keep(2, Remove(2)))),
  Keep(17, Remove(1, Prepend(1, "\""))),
  Keep(20, Remove(1, Prepend(1, "\"")))
, "Concat Multiple");

testBackPropagate(
  Keep(4, Remove(1, Keep(2, Remove(2)))),
  Keep(17, Prepend(1, "\"", Remove(1))),
  Keep(20, Prepend(1, "\"", Remove(1)))
, "Concat Multiple 2");


step = Reuse({
  1: Reuse({
    2: Keep(4, Remove(1, Keep(2, Remove(2))))})});
user = Reuse({
  1: Reuse({
      2: Keep(17,
         Remove(1, Prepend(1, New("\""),
         Remove(1, Prepend(1, New("\""),
         Replace(49, 49, 
           Keep(45, Prepend(1, New("\""), Remove(1))),
         Remove(1, Prepend(1, New("\""),
         Keep(57,
         Remove(1, Prepend(1, New("\""),
         Keep(3,
         Remove(1, Prepend(1, New("\""),
         Keep(46,
         Remove(1, Prepend(1, New("\""),
         Keep(3,
         Remove(1, Prepend(1, New("\""),
))))))))))))))))))))})});

testBackPropagate(step, user,
  Reuse({
    1: Reuse({
      2: Keep(20, Remove(1, Prepend(1, New("\""), Remove(1, Prepend(1, New("\""), Keep(45, Prepend(1, New("\""), Remove(1, Keep(3, Remove(1, Prepend(1, New("\""), Keep(57, Remove(1, Prepend(1, New("\""), Keep(3, Remove(1, Prepend(1, New("\""), Keep(46, Remove(1, Prepend(1, New("\""), Keep(3, Remove(1, Prepend(1, New("\""))))))))))))))))))))))))})}), "editActionOutLength == 0");

shouldBeEqual(
  andThen(
  Reuse({array: Keep(1, Remove(2))}),
  Reuse({array:
    Keep(2, Prepend(5, Up(Offset(2), "array", Down("array2", 3)), RemoveAll()))})),
  Reuse({
    array: Replace(2, 1,
      Keep(1, RemoveAll()),
      Prepend(4, Up(Interval(2), "array", Down("array2", 3, Remove(1))), RemoveAll()))})
);

var editStep = Replace(5, 2, Custom(Reuse(),
    {name: "test",
     apply: x=>x.slice(0, 2),
     update: outEdit => Replace(2, 2, outEdit, Reuse())}), Reuse());
var applied = apply(editStep, [1, 2, 3, 4, 5, 6, 7]);

testBackPropagate(
  editStep,
  Remove(1),
  Remove(1),
  "Do not slit custom"
)

testBackPropagate(
  editStep,
  Remove(3),
  Remove(2, Keep(3, Remove(1))), "Do not split custom 2")


testBackPropagate(
  Custom(New([Down("a"), Down("b", "c")]),
  { name: "max",
    apply: x => x[0] > x[1] ? x[0] : x[1],
    update: outEdit => Reuse({1: outEdit})
  }),
  New(2),
  Reuse({b: Reuse({c: New(2)})})
);

testBackPropagate(
  Reuse({2: Reuse({1: Keep(1, Prepend(1, "\n"))})}),
  Replace(3, 7, Keep(1, Prepend(3, New([ "section",
                                 New([]),
                                 New([])]))),
                 Reuse()),
  Keep(1, Prepend(3, New([ "section",
                    New([]),
                    New([])]))), "independend changes")
shouldBeEqual(editActions.diff(1, undefined), New(undefined));
shouldBeEqual(editActions.diff(undefined, 1), New(1));
shouldBeEqual(editActions.diff(undefined, [undefined], {maxCloneDown: 1}), New([Reuse()]))

var step =
  Replace(2, 2, New([Down(0),
                  Down(1)]),
                Reuse())

var edit =
  Reuse({0: New(42),
         1: New(54)});

testBackPropagate(step, edit, Reuse({
  0: New(42),
  1: New(54)}));

shouldBeEqual(merge(
             Prepend(2, New([1, 2])),
             Prepend(2, New([3, 4]))),
           Choose(
             Prepend(4, New([1, 2, 3, 4])),
             Prepend(4, New([3, 4, 1, 2]))), "merge Prepend x 2");
shouldBeEqual(merge(
             Remove(1),
             Prepend(2, New([3, 4]))),
           Prepend(2, New([3, 4]), Remove(1)), "merge ReuseArray 2");
shouldBeEqual(merge(
             Prepend(2, New([1, 2])),
             Remove(1)),
             Prepend(2, New([1, 2]), Remove(1)), "merge ReuseArray 3");
shouldBeEqual(merge(
             Keep(2, Prepend(1, New([1]), RemoveAll())),
             Remove(1)),
           Remove(1, Keep(1, Prepend(1, New([1]), RemoveAll()))));

shouldBeEqual(merge(
             Remove(1),
             Keep(2, New([1]))),
           Remove(1, Keep(1, New([1]))));
shouldBeEqual(merge(
             Replace(3, 3, Reuse({1: New(2)}), Reuse()),
             Replace(2, 2, Reuse({0: New(1)}), Reuse())),
           Replace(2, 2, Reuse({0: New(1), 1: New(2)}), Keep(1, Reuse())));
shouldBeEqual(merge(
             Replace(2, 2, Reuse({0: New(1)}), Reuse()),
             Replace(3, 3, Reuse({1: New(2)}), Reuse())),
           Replace(2, 2, Reuse({0: New(1), 1: New(2)}), Keep(1, Reuse())));

var a = 
  Replace(2, 2, Keep(1,
                New("1")),
             Reuse());
var b = 
  Keep(1,
             Replace(1, 1, New("0"),
             Reuse()));
shouldBeEqual(andThen(b, a),
  Replace(2, 2, Keep(1, New("0")), Reuse()));

// Weird test, hopefully we will NEVER have a New like that.
var d = Replace(14, New({ 0: Down(0)  ,
                       1: Down(1),
                       2: Down(2),
                       3: Down(4),
                       4: Down(5),
                       5: Down(6),
                       6: Down(7),
                       7: Down(8),
                       8: Down(9),
                       9: Down(10),
                       10: Down(11),
                       11: Down(12),
                       12: Down(13)}, []),
                       Reuse());
var step = Reuse({13: Reuse({1: Keep(1, Prepend(1, New("\n")))})})
shouldBeEqual(backPropagate(step, d), d);
var m1 = Remove(47, Prepend(1, New("A")))
var m2 = Keep(1,
           Prepend(1, New(" "),
              Reuse()))
var m3 = Keep(1,
          Remove(1, Prepend(2, New(" g"))));
var m4 = Keep(3,
           Prepend(1, New("r")));
var m5 = Keep(2,
           Remove(1, Prepend(1, New("G"))));
var m45 = andThen(m5, m4);
shouldBeEqual(m45, Replace(3, 2,
  Keep(2, RemoveAll()),
  Prepend(2, New("Gr"))), "m45");
var m345 = andThen(m45, m3);
shouldBeEqual(m345, Keep(1, Remove(1, Prepend(3, New(" Gr")))), "m345");
var m2345 = andThen(m345, m2);
shouldBeEqual(m2345, Keep(1, Prepend(2, New(" G"), Prepend(1, New("r")))), "m2345");
var m12345 = andThen(m2345, m1);
shouldBeEqual(m12345, Remove(47, Prepend(1, New("A"), Prepend(2, New(" G"), Prepend(1, New("r"))))), "m12345");

var m5b = Keep(4, Prepend(1, New(" ")))
var m6b = Keep(4, Remove(1, Prepend(2, New(" w"))))
var m7b = Keep(6, Prepend(1, New("o")));
var m8b = Keep(2, Remove(1, Prepend(1, New("G"))));
var m7b8b = andThen(m8b, m7b);
shouldBeEqual(m7b8b, Replace(6, 6,
  Keep(2, RemoveExcept(Interval(1, 4), Prepend(1, New("G")))),
  Prepend(1, New("o"))), "m7b8b");
var m6b7b8b = andThen(m7b8b, m6b);
shouldBeEqual(m6b7b8b, Replace(4, 4,
  Keep(2, RemoveExcept(Interval(1, 2), Prepend(1, New("G")))),
  Remove(1, Prepend(3, New(" wo")))), "m6b7b8b");

shouldBeEqual(
  andThen(
    Keep(2, Remove(1, Prepend(1, New("G")))),
    Remove(47, Prepend(1, New("A"),
           Prepend(2, New(" g"),
           Prepend(1, New("r")))))),
  Remove(47, Prepend(1, New("A"),
             Prepend(2, New(" G"),
             Prepend(1, New("r"))))));

shouldBeEqual(
  andThen(Keep(1, Remove(1, Prepend(1, New("B")))), Prepend(2, New(" b"))),
  Prepend(2, New(" B")));

// Prepend followed by deletion of the same element.
//s()
//finishTests(true);
var p1 = "Hello world", p2 = "Hallo world", p3 = "Hallo wrld", p4 = "Hello wrld";
shouldBeEqual(apply(backPropagate(diff(p1, p2), diff(p2, p3)), p1), p4, "Modification then deletion");
var p1 = "Hello world", p2 = "Hllo world", p3 = "Hllo wrld";
shouldBeEqual(apply(backPropagate(diff(p1, p2), diff(p2, p3)), p1), p4, "Deletion then deletion");
var p1 = "Hello world", p2 = "Heillo world", p3 = "Heillo wrld";
shouldBeEqual(apply(backPropagate(diff(p1, p2), diff(p2, p3)), p1), p4, "Prepend then deletion");

var p1 = "Hello world", p2 = "Hallo world", p3 = "Hallo wourld", p4 = "Hello wourld";
shouldBeEqual(apply(backPropagate(diff(p1, p2), diff(p2, p3)), p1), p4, "Modification then prepend");
var p1 = "Hello world", p2 = "Hllo world", p3 = "Hllo wourld";
shouldBeEqual(apply(backPropagate(diff(p1, p2), diff(p2, p3)), p1), p4, "Deletion then prepend");
var p1 = "Hello world", p2 = "Heillo world", p3 = "Heillo wourld";
shouldBeEqual(apply(backPropagate(diff(p1, p2), diff(p2, p3)), p1), p4, "Prepend then prepend");

var p1 = "Hello world", p2 = "Hallo world", p3 = "Hallo warld", p4 = "Hello warld";
shouldBeEqual(apply(backPropagate(diff(p1, p2), diff(p2, p3)), p1), p4, "Modification then modification");
var p1 = "Hello world", p2 = "Hllo world", p3 = "Hllo warld";
shouldBeEqual(apply(backPropagate(diff(p1, p2), diff(p2, p3)), p1), p4, "Deletion then modification");
var p1 = "Hello world", p2 = "Heillo world", p3 = "Heillo warld";
shouldBeEqual(apply(backPropagate(diff(p1, p2), diff(p2, p3)), p1), p4, "Prepend then modification");

addHTMLCapabilities(editActions)

findNextSimilar = debugFun(function findNextSimilar(inArray, toElement, fromIndex) {
  var unevaledToElement = uneval(toElement);
  var isElement = editActions.isElement(toElement);
  var i = fromIndex;
  while(i < inArray.length) {
    var currentElement = inArray[i];
    if(unevaledToElement == uneval(currentElement)) return i;
    if(isElement && editActions.isElement(currentElement)) {
      let currentTag = editActions.getTag(currentElement);
      let currentId = editActions.getId(currentElement);
      let currentClasses = editActions.getClasses(currentElement);
      let toTag = editActions.getTag(toElement);
      let toId = editActions.getId(toElement);
      let toClasses = editActions.getClasses(toElement);
      if(editActions.uniqueTags[currentTag] && currentTag == toTag) {
        return i;
      }
      if(currentId === toId && typeof currentId === "string") {
        return i;
      }
      if(currentTag === toTag && currentClasses === toClasses && currentClasses != "") {
        // TODO: Might not be very useful. We should check if the content is similar. Or unique. Maybe compute Levenshtein distance?
        return i;
      }
    }
    i++;
  }
  return -1;
});

var defaultDiffOptions = {findNextSimilar, onlyReuse: true,
   isCompatibleForReuseArray: (oldValue, newValue) => !editActions.isNode(oldValue) && !editActions.isNode(newValue)};

testBackPropagate(
  Replace(3, 3, New([Down(1), Down(2), Down(0)]), Reuse()),
  Keep(2, Prepend(1, New(["Prepended"]))),
  Prepend(1, New(["Prepended"])),
  "Prepend in array after reordering");

testBackPropagate(
  Prepend(1, Down(Interval(2, 3)), RemoveExcept(Offset(0, 2))),
  Keep(2, Prepend(1, New(["Prepended"]))),
  Keep(1, Prepend(1, New(["Prepended"]))),
  "Prepend in array after reordering 2");

/*
shouldBeEqual(
  diff(
    [["section", [["class", "sec"]], [["TEXT", "abc"]]], ["section", [["class", "sec"]], [["TEXT", "def"]]]],
    [["script", [], []], ["section", [["class", "sec"], ["id", "test"]], [["TEXT", "abc"]]], ["section", [["class", "sec"]], [["TEXT", "def"]]]], defaultDiffOptions
  ),
  ReuseArray(0, New.nested(["script", [], []]),
                Reuse({0: Reuse({1: Keep(1, 0, New.nested([["id", "test"]]))})}))
);
finishTests(true);

shouldBeEqual(
  diff(
    [["div", [["class", "g-static"]], [["TEXT", "Hello"]]]],
    [["script", [], [["TEXT", "var"]]], ["div", [["class", "g-static"]], [["TEXT", "Hello"], ["br", [], []]]]],
    defaultDiffOptions
  ),
  ReuseArray(0, New.nested([["script", [], [["TEXT", "var"]]]]),
                Reuse({0: Reuse({1: Reuse({0: Reuse({1: Keep(8, New(" activated"))})}),
                                 2: Keep(1, New.nested(["br", [], []]))})}))
);
process.exit(0);

shouldBeEqual(
diff(
  [["head", [], [["TEXT", "\n"]]], ["body", [], []]],
  [["head", [], [["TEXT", "\n"],["script", [], []]]], ["TEXT", "\n"], ["body", [], [["script", [], []]]]],
  defaultDiffOptions
),
Replace(1, 1, Reuse({0: Reuse({2: Keep(1, New.nested([["script", [], []]]))})}),
           0, New([New.nested(["TEXT", "\n"])]),
           1, Reuse({0: Reuse({2: New.nested([["script", [], []]])})}),
              New([])));*/
testBackPropagate(
    Reuse({
 heap: Reuse({
   1: Reuse({
     values: Keep(0,
       Replace(1, 1, Reuse({0: Up("0", Offset(0, 1), "values", 1, "heap", Down("stack", "hd", "value"))})))})}),
           stack: Reuse({hd: New({ ctor: "ComputationNode",
                                   node: Up("hd", "stack", Down( "heap", 1, "values", 1))}),
                         tl: Reuse({hd: Reuse({resultIsSpread: New(false),
                                               indexToEval: New(1)})})})}),
    Reuse({heap: Reuse({1: Reuse({values: Keep(1, Prepend(1, New([New({ ctor: "Raw",
                                                                   value: 2})])))})})}),
    Reuse({heap: Reuse({1: Reuse({values: Keep(1, Prepend(1, New([New({ ctor: "Raw",
                                                                       value: 2})])))})})})
, "heap update")

testBackPropagate(
    Down("heap", 1, "values",
      Reuse({0: Down("value"),
             1: Down("value")})),
    Keep(1, Replace(0, 1, New([New({ ctor: "Raw",
                                 value: 2})]))),
    Reuse({heap: Reuse({"1": Reuse({values: 
      Keep(1, Prepend(1, New([New({ ctor: "Raw",
                                 value: 2})]))
    )})})}),
    "heap update X"
    );

testBackPropagate(
    Reuse({0: Down("value")}),
    Prepend(1, New([2]))
   ,Prepend(1, New([2])), "ReuseArray through Reuse");


// Same tests without 

testBackPropagate(
    Replace(2, 2,
      Reuse({1: Up(1, Offset(0, 2), Down(3))}),
      Reuse({1: Up(1, Offset(2), Down(4))})),
    Replace(2, 2,
      Reuse({1: New(3)}),
      Reuse({1: New(4)}))
   , Reuse({3: New(3), 4: New(4)}), "ReuseReuse");

testBackPropagate(
     Prepend(1, New([1])),
     Keep(1, Prepend(1, New([2])))
   , Prepend(1, New([2])), "Prepend Step");

testBackPropagate(
     Remove(1),
     Prepend(1, New([2]))
  , Keep(1, Prepend(1, New([2]))), "Prepend after deletion");

testBackPropagate(
     Keep(2, Reuse({0: Up(0, Offset(2), Down(5))})),
     Replace(3, 3, Reuse({2: New(3)}), Reuse())
  , Reuse({5: New(3)}), "Split right backPropagateReuseArray");

testBackPropagate(
     Keep(2, New([Up(Offset(2), Down(5))])),
     Replace(3, 3, Reuse({2: New(3)}), Reuse())
  , Reuse({5: New(3)}), "Split right backPropagateReuseArray");

testBackPropagate(
     Replace(2, 2, Reuse({1: Up(1, Offset(0, 2), Down(5))}), Reuse()),
     Keep(1, Reuse({0: New(3)}))
  , Reuse({5: New(3)}), "Split left backPropagateReuseArray");

testBackPropagate(
    Down("a"),
    Replace(2, 1, New([4]))
  ,Reuse({a: Replace(2, 1, New([4]))}), "ReuseArray after reuse");

testBackPropagate(
    Remove(2),
    Reuse({3: Reuse({1: Reuse({3: Reuse({1: New("style")})})})})
  ,Reuse({
  5: Reuse({
    1: Reuse({
      3: Reuse({
        1: New("style")})})})}), "Reuse after ReuseArray");

testBackPropagate(
    Prepend(2, New([1, 2])),
    Reuse({5: Reuse({1: Reuse({3: Reuse({1: New("style")})})})})
  ,Reuse({3: Reuse({1: Reuse({3: Reuse({1: New("style")})})})}), "Reuse after ReuseArray 2");

shouldBeEqual(andThen(
     Keep(2, Replace(1, 0, New([]), Reuse())),
     Keep(2, Replace(0, 1, New([1]), Reuse()))
 ),  Reuse(), "prepend followed by deletion");

shouldBeEqual(
  apply(diff([
   "thisisoneelem"
  ], []), ["thisisoneelem"]),
  []);

var array1 = [
 "thisisoneelem"
]
var array2 = [
 "thisisoneelem"
, ["h2", [], [["TEXT", "Hello world"]]]
];
var array1to2 = diff(array1, array2);
shouldBeEqual(apply(array1to2, array1), array2);

var array1 = [
 ["TEXT", "\n"]
, ["h1", [], [["TEXT", "titre"]]]
, ["TEXT", "\n"]
, ["input", [], []]
, ["label", [], []]
, ["TEXT", "\n"]
, ["script", [], []]
, ["TEXT", "\n"]
]
var array2 = [
 ["TEXT", "\n"]
, ["h1", [], [["TEXT", "titre"]]]
, ["h2", [], [["TEXT", "Hello world"]]]
, ["TEXT", "\n"]
, ["input", [], []]
, ["label", [], []]
, ["TEXT", "\n"]
, ["script", [], []]
, ["TEXT", "\n"]
];
var array1to2 = diff(array1, array2);
shouldBeEqual(apply(array1to2, array1), array2);

shouldBeEqual(
  first(diff(array1, array2, {maxCloneDown: 0})),
  Keep(2, Prepend(1, New([New([New("h2"), New([]), New([New([New("TEXT"), New("Hello world")])])])]))));
// andThen with ReuseArray

shouldBeEqual(andThen(
  Reuse({values: Reuse({0: Up(0, "values", Down("toReplace"))})}),
  New({values: Reuse(), toReplace: Down(5)})),
  New({values: Reuse({0: Up(0, Down( 5))}), toReplace: Down(5)}), "andThen_ReuseArray1");

// First cut before second cut, no overlap, only reuse
shouldBeEqual(andThen(
     Keep(10, Reuse({1: New(3)})),
     Replace(6, 6, Reuse({1: New(2)}))
  ), Replace(6, 6, Reuse({1: New(2)}), Keep(4, Reuse({1: New(3)}))), "andThen_ReuseArray2");


// First cut after second cut, no overlap, only reuse
shouldBeEqual(andThen(
     Replace(6, 6, Reuse({1: New(3)}), Reuse()),
     Keep(10, Reuse({1: New(2)}))
  ), Replace(10, 10, Replace(6, 6, Reuse({1: New(3)}), Reuse()), Reuse({1: New(2)})), "andThen_ReuseArray3");

// First cut before second cut, small overlap, only reuse
shouldBeEqual(andThen(
     Replace(10, 10, Reuse({9: New(3)}), Reuse()),
     Keep(6, Reuse({1: New(2)}))
  ), Keep(6, Replace(4, 4, Reuse({1: New(2), 3: New(3)}), Reuse())), "andThen_ReuseArray4");

// First cut after second cut, small overlap, only reuse
shouldBeEqual(andThen(
     Keep(6, Reuse({1: New(2)})),
     Replace(10, 10, Reuse({9: New(3)}), Reuse())
  ), Replace(10, 10, Keep(6, Reuse({1: New(2), 3: New(3)}))), "andThen_ReuseArray5");

// First cut before second cut, full overlap, only reuse
shouldBeEqual(andThen(
     Replace(10, 10, Reuse({7: Reuse({b: Up("b", Down( "a"))})}), Reuse()),
     Keep(6, Reuse({1: New({a: New(2), b: New(3)})}))
  ), Keep(6, Replace(4, 4, Reuse({1: New({a: New(2), b: New(2)})}), Reuse())), "andThen_ReuseArray6");

// First cut after second cut, full overlap, only reuse
shouldBeEqual(andThen(
     Keep(6, Reuse({1: Reuse({b: Up("b", Down( "a"))})})),
     Replace(10, 10, Reuse({7: New({a: 2, b: New(3)})}), Reuse())
  ), Replace(10, 10, Keep(6, Reuse({1: New({ a: 2, b: 2})}))), "andThen_ReuseArray7");

// Reaching outside of ReuseArray after deletion
shouldBeEqual(andThen(
     Reuse({values: Keep(2, Remove(1, New([Up(Offset(3), "values", Down("toReplace"))])))}),
     New({values: Reuse(), toReplace: Down(5)})
  ), New({values: Keep(2, Remove(1, New([Up(Offset(3), Down(5))]))),
     toReplace: Down(5)
  }), "andThen_ReuseArray8");

shouldBeEqual(andThen(
     Remove(1), // 2. Remove first element
     Remove(1)  // 1. Remove first element
  ), Remove(2), "andThen_ReuseArrayRemove1"); // Remove first two elements

shouldBeEqual(andThen(
     Remove(1), // 2. Remove first element
     Keep(2, RemoveAll())  // 1. Remove everything but first two elements
  ), RemoveExcept(Interval(1, 2)), "andThen_ReuseArrayRemove2"); // Remove everything but second element.

shouldBeEqual(andThen(
     Keep(5, Remove(1)), // 2. Keep first 5 els, remove 6th
     Remove(1)                          // 1. Remove first element
  ), Remove(1, Keep(5, Remove(1))), "andThen_ReuseArrayRemove3");

shouldBeEqual(andThen(
     Keep(5, Remove(1)), // 2. Keep first 5 els, remove 6th
     Replace(1, 1, Reuse({0: New(1)}), Reuse())               // 1. Replace first element
  ), Replace(1, 1, Reuse({0: New(1)}), Keep(4, Remove(1))), "andThen_ReuseArrayRemove4");

// If first action is a New, then result should be the computation of applying the edit action
shouldBeEqual(andThen(
     Keep(3, Remove(1, Prepend(1, New([11]), Reuse({1: 4})))),
     New([0,0,0,1, 2, 3])
  ), New([0,0,0,11, 2, 4]));

// If second action is a New, then result should be a New as well
shouldBeEqual(andThen(
     New([Down(3)]),
     Keep(3, Replace(1, 1, Reuse({0: Up(0, Offset(3), Down( 1))})))
  ), New([Down(1)]));
//--------------------

shouldBeEqual(
  andThen(
    New({x: Down("a")}),
    Reuse({a: Up("a", Down( "b"))})),
  New({x: Down("b")})
);

shouldBeEqual(
  first(diff([["b", [], [["TEXT", "hello"]]]], [["TEXT", "hello"]], {maxCloneDown: 3})),
  Down(0, 2)
)
//process.exit(0)

shouldBeEqual(
  diff(["p", 1, 1], [1, "p"]),
  Choose(
  Prepend(1, New([Choose(
        Down(1),
        Down(2),
        New(1))]),
    Keep(1, Remove(2))),
  New([
  Choose(
      Down(1),
      Down(2)), Down(0)]))
);
shouldBeEqual(
  diff(["p", 1, 1], [1, "p"], {onlyReuse: true}),
  Prepend(1, New([Choose(
      Down(1),
      Down(2))]),
  Keep(1, Remove(2)))
);

shouldBeEqual(
  diff(["link", "meta"], ["script", "script", "link", "meta"], {maxDepth: 0, onlyReuse: true}),
  Prepend(2, New([New("script"), New("script")]))
);

shouldBeEqual(
  andThen(Reuse({a: Up("a", Down( "b"))}), Reuse({b: Up("b", Down( "c")), a: New(1) })),
  Reuse({a: Up("a", Down( "c")), b: Up("b", Down( "c"))}));

shouldBeEqual(
  backPropagate(
    Down("heap", Replace(1, 1,
           Reuse({0: Down("value")}),
           Replace(1, 1, Reuse({0: Down("value")})))),
    Keep(1, Replace(0, 1, New([2])))
  ),
  Reuse({
    heap: Keep(1, Prepend(1, New([2])))})
);

shouldBeEqual(
  apply(Keep(5, New("big")), "Hello"),
  "Hellobig"
);

shouldBeEqual(
  first(New([])), New([])
)

shouldBeEqual(
  first(Choose(
    Down("abc", Reuse({
      value: Concat(1, Choose(New([]), New([1])), Reuse()),
    })), New(1))
  ),
  Down("abc", Reuse({value: Concat(1, New([]), Reuse())}))
);

shouldBeEqual(
  andThen(Down("f", Reuse({a: Up("a", Down( "b"))})), Down("g", Reuse({f: New({a: New(1), b: New(2)})}))),
  Down("g", "f", New({a: New(2), b: New(2)})));

addLens = {
  apply: function add([{value: left}, {value: right}]) { return {value: left + right}; },
  update: function (editAction, [{value: left}, {value: right}], {value: oldValue}) {
        if(transform.isReuse(editAction)) {
          let newValueEdit = transform.childIfReuse(editAction, "value");
          if(transform.isNew(newValueEdit)) {
            let newValue = transform.valueIfNew(newValueEdit);
            return Reuse({0: Reuse({value: New(left + newValue - oldValue)})});
          }
        }
        console.log(editAction);
        throw "Edit action not supported in + lens";
      }
}
step = 
  Reuse({stack: Reuse({hd: New({ ctor: "Result",
                               value: Custom(Down("argsEvaled"), addLens)})})});

// Need to execute the lens once in forward first so that it can cache the results.
shouldBeEqual(apply(step, { stack: {hd: {argsEvaled: [{value: 1}, {value: 2}]}}}), { stack: {hd: {ctor: "Result", value: {value: 3}}}});

testBackPropagate(step,
  Reuse({stack: Reuse({hd: Reuse({value: Reuse({value: New(4)})})})}),
  Reuse({stack: Reuse({hd: Reuse({argsEvaled: Reuse({ 0: Reuse({ value: New(2)})})})})}));

shouldBeEqual(
  andThen(
    Reuse({
      a: Reuse({
        c: New(1)}),
      b: Up("b", Down( "a"))}),
    New({a: Reuse()})),
  New({a: Reuse({c: New(1)}), b: Reuse()})
);

var thisObj = { ctor: "Ref", heapIndex: 8}

shouldBeEqual(apply(
  Reuse({
    env: Up("env", Down( "heap", 5, "env")),
    stack: New({
      hd: New({
        ctor: "AssignmentMultiple",
        params: New([]),
        args: Down("hd", "argsEvaled", Replace(0, 1,
          New([New(thisObj)]),
          Reuse()))}),
      tl: New({
        hd: New({
          ctor: "ComputationNode",
          node: Up("stack", Down( "heap", 5, "funDecl", "body"))}),
        tl: New({
          hd: New({
            ctor: "EndOfFunction",
            env: Up("stack", Down( "env"))}),
          tl: Down("tl")})})})}),
  {env: "removed",
   heap: [{ctor: "Obj"}, {ctor: "Obj"}, {ctor: "Obj"}, {ctor: "Obj"}, {ctor: "Obj"}, {env: "newenv", funDecl: {body: "test"}}],
   stack: {
     hd: {argsEvaled: []},
     tl: 2
   }
  }),
  {env: "newenv",
   heap: [{ctor: "Obj"}, {ctor: "Obj"}, {ctor: "Obj"}, {ctor: "Obj"}, {ctor: "Obj"}, {env: "newenv", funDecl: {body: "test"}}],
   stack: {
     hd: {ctor: "AssignmentMultiple", params: [],
          args: [{ctor: "Ref", heapIndex: 8}]},
     tl: {
       hd: {ctor: "ComputationNode",
            node: "test"},
       tl: {
         hd: {ctor: "EndOfFunction", env: "removed"},
         tl: 2
       }
     }
   }
  }
)

shouldBeEqual(thisObj, { ctor: "Ref", heapIndex: 8})

shouldBeEqual(
  apply( Reuse({
    stack: Reuse({
      hd: Up("hd", Down("tl", "hd", Reuse({ // Convert to self-sufficient computation
    objectRef: Up("objectRef", "hd", "tl", Down("hd", "value"))}))),
      tl: Down("tl")})}),
    {stack: {hd: {value: 2}, tl: {hd: {objectRef: 1, n: 3}, tl: undefined}}}),
  {stack: {hd: {objectRef: 2, n: 3}, tl: undefined}});

//Composition

shouldBeEqual(andThen(Reuse(), Reuse()), Reuse());
shouldBeEqual(andThen(Reuse(), New(1)), New(1));
shouldBeEqual(andThen(New(1), Reuse()), New(1));
shouldBeEqual(andThen(New(1), New(2)), New(1));
shouldBeEqual(andThen(Reuse({a: Up("a", Down("b"))}), New({a: New(1), b: New(2)})),
            New({a: New(2), b: New(2)}));
            
shouldBeEqual(andThen(Down("a"), Reuse()), Down("a"))
shouldBeEqual(andThen(Reuse(), Down("a")), Down("a"))

s0 = New({ stack: New({ hd: New({ ctor: "ComputationNode",
                                  node: Reuse()}),
                        tl: undefined})}, {env:1, heap: 1});
s1 = Reuse({stack: Reuse({hd: New({ ctor: "Statements",
                               statements: New({ hd: Down("node", "body", 0),
                                                 tl: undefined})})})})
s2 = Reuse({stack: Reuse({hd: New({ ctor: "ComputationNode",
                               node: Down("statements", "hd")}),
                     tl: Up("tl", Reuse( "hd", {statements: Down("tl")}))})});
s3 = Reuse({stack: Reuse({hd: Reuse({node: Down("expression")})})});
s10 = New({ stack: New({ hd: New({ ctor: "Statements",
                             statements: New({ hd: Down("body", 0),
                                               tl: undefined})}),
                         tl: undefined})}, {env:1, heap: 1});
//shouldBeEqual(andThen(s1, s0), s10);
s20 = New({ stack: New({ hd: New({ ctor: "ComputationNode", node: Down("body", 0)}),
  tl: New({ ctor: "Statements",
                             statements: New(undefined)})
})}, {env: 1, heap: 1});
//shouldBeEqual(andThen(s2, s10), s20);
s30 = New({ stack: New({ hd: New({ ctor: "ComputationNode",
                             node: Down("body", 0, "expression")}),
                   tl: New({ ctor: "Statements",
                             statements: New(undefined)})})}, {env:1, heap: 1})
shouldBeEqual(andThen(s3, s20), s30);

// Back-propagation

shouldBeEqual(backPropagate(
   Down("b"),
    New(3)),
  Reuse({b: New(3)}), "Clone new");

shouldBeEqual(backPropagate(
   Down("b", Reuse({d: Up("d", Down( "c"))})),
    Reuse({d: New(3)})),
  Reuse({b: Reuse({c: New(3)})}));

shouldBeEqual(backPropagate(
   Reuse({d: Up("d", Down( "c")), e: Up("e", Down( "c"))}),
    Reuse({d: New(3), e: New(5)})),
  Reuse({c: Choose(New(3), New(5))}));

shouldBeEqual(backPropagate(
   Reuse({a: Up("a", Down( "b"))}),
    Down("a")),
  Down("b"));

shouldBeEqual(backPropagate(
   Reuse({a: Up("a", Down( "b"))}),
    Down("a")),
  Down("b"));

shouldBeEqual(backPropagate(
   New({a: Down("b"), b: Down("b")}),
    Down("a")),
  Down("b"));

shouldBeEqual(backPropagate(
   New({a: Down("b"), b: Down("b")}),
    Down("a")),
  Down("b"));

shouldBeEqual(backPropagate(
   Reuse({a: Up("a", Down( "b"))}),
    Down("b")),
  Down("b"));

shouldBeEqual(backPropagate(
   Reuse({a: Up("a", Down( "b")), b: Up("b", Down( "a"))}),
    Down("b")),
  Down("a"));

shouldBeEqual(backPropagate(
   Reuse({a: Up("a", Down( "b"))}),
    Reuse({a: New(3)})),
  Reuse({b: New(3)}));

shouldBeEqual(backPropagate(
   New({d: Down("a"), c: Down("a"), b: Down("b")}),
    Reuse({d: New(3), c: New(5)})),
  Reuse({a: Choose(New(3), New(5))}));

shouldBeEqual(backPropagate(
   New({a: Reuse(), b: Reuse()}),
    Reuse({a: New(2)})),
  New(2));

shouldBeEqual(backPropagate(
   Down("a", Reuse({
     b: Up("b", "a", Down("c"))
   })),
    Reuse({
      b: New(3)
    })),
  Reuse({
    c: New(3)
  }));

shouldBeEqual(backPropagate(
   Down("app", "body", Reuse({
      body: Reuse({
        app: Reuse({
          arg: Up("arg", "app", "body", "body", "app", Down("arg"))
        }),
        arg: Up("arg", "body", "body", "app", Down("arg"))
      })
      })),
    Reuse({body: Choose(Reuse({app: Down("app")}), Down("app"))})),
  Choose(Reuse({
    app: Reuse({
      body: Reuse({
         body: Reuse({app: Down("app")})
       })
      })
    }),
  Reuse({
    app: Reuse({
      body: Reuse({
         body: Down("app")
       })
      })
    })
  )
  );

shouldBeEqual(backPropagate(
  New({
    a: New({
      b: Down("c", Reuse({
        d: Up("d", "c", Down("f"))})) })}),
  Reuse({
    a: Reuse({
      b: Reuse({
        d: Up("d", Down("e", Reuse({
          p: Up("p", "e", Down("d"))}))),
        e: Up("e", Down("d"))})})})),
  Reuse({
    f: Up("f", Down("c", "e")),
    c: Reuse({
      e: Up("e", "c", Down("f"))})}));
  
// Weird: Why Down("e") disappears?)
shouldBeEqual(backPropagate(
  New({
    a: New({
      b: Down("c", Reuse({
        d: Up("d", "c", Down("f"))})) })}),
  Reuse({
    a: Reuse({
      b: Reuse({
        d: Up("d", Down("e", ReuseAsIs({
          p: Up("p", "e", Down("d"))}))),
        e: Up("e", Down( "d"))})})})),
  Reuse({
    f: Up("f", Down("c", ReuseAsIs({
      p: Up("p", "c", Down("f"))}))),
    c: Reuse({e: Up("e","c", Down("f"))})
  }));

shouldBeEqual(backPropagate(
  Reuse({
    a: New({
      k: Up("a", Down( "b", "c")),
      p: Up("a", Down( "b", "d"))}),
    b: Up("b", Down( "a", "m"))}),
  Reuse({
    b: New({
      u: Reuse(),
      o: Up("b", Down( "a", "k")),
      t: Up("b", Down( "a", "p"))})})),
 Reuse({
   a: Reuse({
     m: New({
       u: Reuse(),
       o: Up("m", "a", Down("b", "c")),
       t: Up("m", "a", Down( "b", "d"))})})}));

shouldBeEqual(backPropagate(
  New({a: New({b: Down("c", Reuse({d: Up("d", "c", Down("f"))})) })}),
  Reuse({a: Reuse({b: Reuse({d: Up("d", Down("e", Reuse({p: Up("p", "e", Down("d"))}))), e: Up("e", Down( "d"))})})})),
  Reuse({
  f: Up("f", Down("c", "e")),
  c: Reuse({
    e: Up("e", "c", Down("f"))})})/*
  Reuse(
    {f: Up("f", Down("c", "e", Reuse({p: Up("p", "e", "c", Down("f"))}))),
     c: Reuse({e: Up("e", "c", Down("f"))})
    })*/);

shouldBeEqual(backPropagate(
  Reuse({a: New({k: Up("a", Down( "b", "c")), p: Up("a", Down( "b", "d"))}), b: Up("b", Down( "a", "m"))}),
  Reuse({b: New({u: Reuse(), o: Up("b", Down( "a", "k")), t: Up("b", Down( "a", "p"))})})),
 Reuse({a: Reuse({m: New({u: Reuse(), o: Up("m", "a", Down("b", "c")), t: Up("m", "a", Down("b", "d"))})})}));

shouldBeEqual(backPropagate(
  Down("app", "body", Reuse({arg: Up("arg", "body", "app", Down("arg"))})),
  Reuse({arg: Up("arg", Down( "app"))})),
  Reuse({arg: Up("arg", Down( "app", "body", "app"))})
)

shouldBeEqual(backPropagate(
  Down("app", "body", Reuse({arg: Up("arg", "body","app", Down( "arg"))})),
  New({app: Down("app"), arg: Down("app")})),
  Reuse({app: Reuse({body: New({app: Down("app"), arg: Down("app")})})})
)

shouldBeEqual(backPropagate(
    New({b: Down("a"), c: Down("a")}),
    Reuse({b: New(2), c: Insert("d", {d: Reuse()})})),
    Reuse({a: Insert("d", {d: New(2)})})
  )

// ReuseArray

var prog = ["To move elsewhere", "Keep", "Keep with next", "Keep and to clone"];

var step = Replace(
    1, 0, New([]),                            // Removes 0
    Keep(1,                            // Keeps 1
    Replace(0, 1, New([Up(Offset(2), Down(3))]),              // Clones the field 3 before 2
    Keep(2, // Keeps 2 and 3
    Replace(0, 1, New([Up(Offset(4), Down(0))]),         // Move the field "0" there
    Replace(0, 1, New([New("Prepended at end")])) // Prepends a new value
    ))))
  );

shouldBeEqual(apply(step, prog),
  ["Keep", "Keep and to clone", "Keep with next", "Keep and to clone", "To move elsewhere", "Prepended at end"]);

shouldBeEqual(apply(
  Reuse({heap: Keep(
  1, Replace(1, 1, Reuse({0: Up(0, Offset(0, 1), "heap", Down("stack", "hd", "value"))}), Keep(1, RemoveAll())))}),
    {heap: [40, 50, 60], stack: {hd: {value: 1}}}),
  {heap: [40, 1, 60], stack: {hd: {value: 1}}})

step = Keep(
      5,                        // "Hello"
      Replace(6, 22,                                 // " world"
        Replace(
          0, 16, New(" big world, nice"),   // prepend
          Reuse()                    // " world"
        ),
      Keep(2, // The string "! "
      Prepend(1, New("?"), // The inserted string "?"
      Reuse()
    ))));
    
shouldBeEqual(apply(step, "Hello world! ?"), "Hello big world, nice world! ??")

// Should not fail
shouldBeEqual(
  apply(Keep(1, Replace(0, 2, New([undefined, undefined]))), [0]),
  [0, undefined, undefined]);

///// Complex interactions between ReuseArray, New and Reuse

pStep = Reuse({heap:
       Keep(1, 
       Replace(
       1, 1, Reuse({0: Up(0, Offset(1,1), "heap", Down("stack", "hd"))}),
       RemoveAll()))});
uStep = Reuse({heap: Reuse({1: Reuse({value: New(22)})})});

testBackPropagate(
  pStep, uStep,
  Reuse({stack: Reuse({hd: Reuse({value: New(22)})})}), "pStep_uStep1");

pStep = Reuse({
  heap: 
    Remove(1,
    Replace(4, 6,
      Replace(1, 3,
        New([2, 3, 4])),
    Keep(1)))});
uStep = Reuse({heap: Reuse({5: Reuse({value: New(22)})})});

testBackPropagate(
  pStep, uStep,
  Reuse({
  heap: Reuse({
    4: Reuse({
      value: New(22)})})}), "pStep_uStep2");

pStep = Reuse({heap: Remove(
       1, Replace(3, 1, New([Up(Offset(1, 3), Down(2))])))});
uStep = Reuse({heap: Reuse({0: Reuse({value: New(22)})})});

testBackPropagate(
  pStep, uStep,
  Reuse({heap: Reuse({2: Reuse({value: New(22)})})}), "pStep_uStep3");

pStep = Reuse({heap: Replace(
       1, 2, New([5, 6]),
       Replace(3, 1, New([Down(2)])))});
uStep = Reuse({heap: Reuse({2: Reuse({value: New(22)})})});

testBackPropagate(
  pStep, uStep,
  Reuse({
  heap: Reuse({
    3: Reuse({
      value: New(22)})})}), "pStep_uStep4");

// Custom
var plusEditAction =
  Custom(Down("args"),
           ({left, right}) => left + right,
           function(outputDiff, {left, right}, outputOld) {
             if(outputDiff.ctor === Type.New) {
               let diff = outputDiff.model.value - outputOld;
               return Choose(Reuse({left: New(left + diff)}), Reuse({right: New(right + diff)}));
             } else {
               console.log(stringOf(outputDiff));
               throw "Unsupported output edit action for the + operator"
             }
           });

shouldBeEqual(
  apply(plusEditAction, {type: "Add", args: {left: 1, right: 3}}),
  4
)

shouldBeEqual(
  backPropagate(plusEditAction, New(5)),
  Choose(Reuse({args: Reuse({left: New(2)})}),
    Reuse({args: Reuse({right: New(4)})})
  )
)

// Custom composed with Reuse
var step1 = Reuse({b: Custom(Reuse(),
  { apply: x => ({a: x + 1}),
    update: editOut => New(transform.valueIfNew(transform.childIfReuse(editOut, "a")) - 1),
    name: "Wrap and add 1"
  })});
var step2 = Reuse({c: Up("c", Down("b", Reuse({c: Up("c", Down("a"))})))});
var combined = andThen(step2, step1);
shouldBeEqual(apply(combined, {b: 1}), {b: {a: 2}, c: {a: 2, c: 2}});
shouldBeEqual(backPropagate(combined, Reuse({b: Reuse({a: New(3)})})), Reuse({b: New(2)}))

shouldBeEqual(
  editActions.__ReuseUp(Up(3, Up(Offset(2))), Up(3, Offset(2), Down(0))),
  Reuse({5: Up(5, Down(0))})
);

shouldBeEqual(
  editActions.__ReuseUp(Up(5, Offset(2)), Reuse({3: Up(3, 5, Offset(2), Down(0))})),
  Reuse({7: Reuse({3: Up(3, 7, Down(0))})})
);


finishTests();

function finishTests(temp) {
  if(incompleteLines.length > 0) {
    console.log("These tests were reduced for easier debug, please expand them for full test:")
    console.log("Lines " + incompleteLines.join(", "));
  }
  console.log(testsPassed + "/" + tests + " passed");
  if(testsPassed !== tests) {
    console.log((tests - testsPassed) + " tests failed" + (temp ? " so far" : ""));
    console.log("See lines " + linesFailed.join(", "));
  } else {
    console.log("All tests passed" + (temp ? " so far" : ""));
  }
  if(temp) {
    process.exit(0)
  }
}

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
    return x;
  }
  if(typeof x == "object" && x == null) {
    return "null";
  }
  if(typeof x == "object") {
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

function currentTestLine() {
  let trace = Error().stack;
  let line = trace.match(/edit-actions-test\.js:(\d+)(?![\s\S]*edit-actions-test)/)[1];
  return line;
}
function shouldBeEqual(x1, x2, name) {
  tests++;
  var s1 = uneval(x1, "");
  var s2 = uneval(x2, "");
  let line = currentTestLine()
  if(s1 == s2) {
    testsPassed++;
  } else {
    linesFailed.push(line);
    console.log((name ? (typeof name == "function" ? name() : name) + " (line "+line+"): " : "Line " + line + ":") + "Expected\n" + s2 + "\n, got \n" + s1);
    if(failAtFirst) {
      e();
    }
  }
  if(testToStopAt !== undefined && tests >= testToStopAt) e(line);
}

function shouldCommute(x1, x2, dothey, name) {
  tests+=2;
  if(typeof dothey === "undefined") dothey = true;
  if(dothey && !commute(x1, x2) || !dothey && commute(x1, x2)) {
    console.log((name ? name + ": " : "") + "Expected to " + (dothey ? "": "NOT ") + "commute, but they did" + (dothey ? " not": "") + ":\n" + stringOf(x1) + "\n" + stringOf(x2));
  } else {
    testsPassed++;
  }
  if(dothey && !commute(x2, x1) || !dothey && commute(x2, x1)) {
    console.log((name ? name + ": " : "") + "(reversed) Expected to " + (dothey ? "": "NOT ") + "commute, but they did" + (dothey ? " not": "") + ":\n" + stringOf(x2) + "\n" + stringOf(x1));
  } else {
    testsPassed++;
  }
  if(testToStopAt !== undefined && tests >= testToStopAt) e();
}

function debugFun(fun) {
  return function() {
    console.log(fun.name + " called with ", arguments);
    let result = fun(...arguments);
    console.log("Returns", result);
    result;
  }
}

function addHTMLCapabilities(editActions) {
  editActions.isElement = x => Array.isArray(x) && x.length == 3 && typeof x[0] === "string" && Array.isArray(x[1]) && Array.isArray(x[2]);
  editActions.isTextNode = x => Array.isArray(x) && x.length == 2 && x[0] === "TEXT" && typeof x[1] === "string"
  editActions.isCommentNode = x => Array.isArray(x) && x.length == 2 && x[0] === "COMMENT" && typeof x[1] === "string"
  editActions.isNode = x => editActions.isElement(x) || editActions.isTextNode(x) || editActions.isCommentNode(x);
  editActions.getAttr = attr => x => {
    if(!editActions.isElement(x)) return undefined;
    for(var i = 0; i < x[1].length; i++) {
      if(x[1][i][0] == attr) {
        return x[1][i][1];
      }
    }
  }
  editActions.getAttrs = x => {
    if(!editActions.isElement(x)) return undefined;
    let res = {};
    for(var i = 0; i < x[1].length; i++) {
      res[x[1][i][0]] = x[1][i][1];
    }
    return res;
  }
  editActions.getId = editActions.getAttr("id");
  editActions.getClasses = editActions.getAttr("class");
  editActions.getTag = x => editActions.isElement(x) ? x[0] : undefined;

  editActions.uniqueTags = {head: true, body: true, html: true};
}

// Verify that applying firstAction and secondAction to the input is the same as applying the andthen on the input.
function testAndThen(secondAction, firstAction, input, debugIntermediate) {
  let total = andThen(secondAction, firstAction);
  if(editActions.__debug || debugIntermediate) {
    console.log("composition:\n",stringOf(total));
  }
  let expected = apply(secondAction, apply(firstAction, input));
  let got = apply(total, input);
  /*console.log("expected", expected);
  console.log("got", expected);*/
  shouldBeEqual(got, expected);
}


// Starts debugging
function s() {
  editActions.__debug = true;
}
// Stops testing
function e(lastLine) {
  lastLine = lastLine || currentTestLine();
  if(lastLine !== undefined) {
    console.log("Last test run at line " + lastLine);
  }
  finishTests(true);
}
// Tests only the next test;
function n(count = 1) {
  s();
  testToStopAt = tests + count;
}

function testMerge(edit1, edit2, expectedResult, name) {
  shouldBeEqual(
    merge(
      edit1, edit2
    ), expectedResult, name
  );
}
function testMergeAndReverse(edit1, edit2, expectedResult, name) {
  shouldBeEqual(
    merge(
      edit1, edit2
    ), expectedResult, name + " [normal]"
  );
  shouldBeEqual(
    merge(
      edit2, edit1
    ), expectedResult, name + " [reverse]"
  );
}
