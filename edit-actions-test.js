var editActions = require("./edit-actions.js");
var {List,Reuse,New,Concat,Keep,Insert,Delete,Up,Down,Custom,UseResult,Type,Offset,__AddContext,__ContextElem,isOffset,uneval,apply,andThen, Fork, splitAt, downAt, offsetAt, stringOf, Sequence, ActionContextElem, up, ReuseArray, merge, ReuseOffset, backPropagate, isIdentity, Choose, choose} = editActions;
var tests = 0, testToStopAt = undefined;
var testsPassed = 0; linesFailed = [], incompleteLines = [];
var bs = "\\\\";
var failAtFirst = true;

shouldBeEqual(
  stringOf(Choose(New(1), New(2))),
  "Choose(\n  New(1),\n  New(2))"
);

shouldBeEqual(
  apply(
    Delete(3, Keep(5, Insert(2, Up(Offset(7, undefined, 2))))),
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
    Concat(5, Down(Offset(0, 5), Reuse({0: Up(0, Offset(0, 5), Down(2))})), Down(Offset(5), Concat(3, Down(Offset(0, 3)), Down(Offset(3)))))
  ),
  Concat(5, Down(Offset(0, 5), Reuse({0: Up(0, Offset(0, 5), Down(2))})), Down(Offset(5), Concat(3, Down(Offset(0, 3)), Down(Offset(3), Reuse({1: Up(1, Offset(8), Down(2))}))))));

shouldBeEqual(
  apply({1: Down(2), 2: {a: Reuse({1: 0})}, 3: undefined},
    [0, 1, 2, 3]),
    {1: 2, 2: {a: [0, 0, 2, 3]}, 3: undefined});

shouldBeEqual(
  Down(1, New([])), New([]) 
);

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
  stringOf(Up(1, Offset(2))), "Up(1, Offset(2))"
);

shouldBeEqual(stringOf(Keep(10, Delete(5))), "Keep(10, Delete(5))");

shouldBeEqual(stringOf(Keep(8, New("1"))), "Keep(8, New(\"1\"))");

shouldBeEqual(stringOf(Fork(5, 0, Down(Offset(0, 0)), Reuse())),
"Delete(5)");

shouldBeEqual(stringOf(Fork(3, 3, Reuse(), Down(Offset(0, 0)))), "Keep(3, Down(Offset(0, 0)))");

shouldBeEqual(
  andThen(Down(Offset(3, 5)), Custom(Reuse(), {apply: x => "1"+ x, update: e => ReuseOffset(Offset(1), e), name: "append1"})),
  Custom(Custom(Reuse(), {name: "append1"}), {name: "applyOffset(Offset(3, 5), _)"}))

// This test is failing because Concat is not stored in the context when going down.
testAndThen(
  Down(1, Reuse({a: Up("a", 1, Down(2))})),
  Concat(2, Reuse(), New([Down(0), 1])),
  [{a: "a"}, "b"]
);

shouldBeEqual(
  stringOf(Concat(3, Down(Offset(2, 5)), Down(Offset(8)))),  "Fork(8, 3,\n  Down(Offset(2, 5, 8)),\n  Reuse())"
);

/*
shouldBeEqual(andThen(Down("f"), Custom(Reuse(), x => x, y => y, "id")), Reuse())
*/

shouldBeEqual(Up(Offset(0, 2), Down(Offset(0, 2))), Down(Offset(0, 2, 2)));

shouldBeEqual(stringOf(Up(Offset(2), Down(1))), "Up(Offset(2), Down(1))");

shouldBeEqual(apply(Reuse({ a: New(1) }), {a: 2}), {a: 1});

shouldBeEqual(Keep(3, Reuse()), Reuse());
shouldBeEqual(Keep(3, Keep(5, New("1"))), Keep(8, New("1")));
shouldBeEqual(Keep(3, Keep(5, New([1]))), Keep(8, New([1])));

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

shouldBeEqual(apply(Down(Offset(2, 5), Insert(5, New("hello"), Up(Offset(2, 5, 2)))), "abcdefghijk"), "helloab");

shouldBeEqual(apply(Keep(3, Reuse({1: New(0)})), [0, 1, 2, 3, 4, 5]), [0, 1, 2, 3, 0, 5])
shouldBeEqual(apply(Keep(3, New("def")), "abcghi"), "abcdef");

shouldBeEqual(apply(Down(Offset(3)), [0, 1, 2, 3, 4, 5]), [3, 4, 5]);
shouldBeEqual(apply(Keep(3, New([Up(Offset(3), Down(0))])), [0, 1, 2, 3, 4, 5]), [0, 1, 2, 0]);

shouldBeEqual(apply(Reuse({a: Keep(3, Insert(2, Up(Offset(3), "a", Down("b")), Delete(1)))}), {b: "XY", a: "abcdefghi"}), {b: "XY", a: "abcXYefghi"});

var x = apply(Reuse({x: UseResult(Up("x"))}), {a: 1});
shouldBeEqual(x.x.x.x.x.a, 1);
  
/*
function testSplitAt(count, editAction, expected, recordToTestOn) {
  let [left, right, inCount] = splitAt(count, editAction);
  shouldBeEqual([left, right, inCount], expected, "result of splitAt");
  let result1 = apply(Fork(expected[2], count, expected[0], expected[1]), recordToTestOn);
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

testSplitAt(2, Fork(3, 2, New("ab"), Reuse()),
  [New("ab"), Reuse(), 3], "");

testSplitAt(2, Fork(3, 3, Reuse({0: Up(0, Down(4)), 1: Up(1, Down(2)), 2: Up(2, Down(3))}), Reuse({0: Up(3, Down(1)), 1: Up(4, Down(5))})),
  [ Reuse({0: Up(0, Down(4)), 1: Up(1, Down(2))}),
    Fork(1, 1, Reuse({0: Up(2, Down(3))}), Reuse({0: Up(3, Down(1)), 1: Up(4, Down(5))})),
    2],
  [0, 1, 2, 3, 4, 5, 6, 7])

testSplitAt(4, Fork(3, 3, Reuse({0: Up(0, Down(4)), 1: Up(1, Down(2)), 2: Up(2, Down(3))}), Reuse({0: Up(3, Down(1)), 1: Up(4, Down(5))})),
  [ Fork(3, 3, Reuse({0: Up(0, Down(4)), 1: Up(1, Down(2)), 2: Up(2, Down(3))}), Reuse({0: Up(3, Down(1))})),
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

shouldBeEqual(andThen(Fork(2, 2, Reuse(), Up(Offset(2))), Reuse({1: New(1), 3: Up(3, Down(0)), 4: Up(4, Down(3))})),
  Fork(2, 2, Reuse({1: New(1)}), Up(Offset(2), Reuse({1: New(1), 3: Up(3, Down(0)), 4: Up(4, Down(3))})))
  )

shouldBeEqual(andThen(Reuse({x: Reuse({y: Up("y", "x", Down("c"))})}), Reuse({c: Up("c", Down("x", "y", "z", Reuse()))})),
              Reuse({x: Reuse({y: Down("z", Reuse())}),
                     c: Up("c", Down("x", "y", "z", Reuse()))
              }))

shouldBeEqual(andThen(Reuse({a: Down("c")}), Reuse({a: Up("a", Down("b"))})), Reuse({a: Up("a", Down("b", Down("c")))}));

shouldBeEqual(andThen(Reuse({a: Reuse({c: Up("c", Up("a", Reuse({a: Reuse({d: New(1)})})))})}),
        Reuse({a: Up("a", Reuse())})),
Reuse({a: Up("a", Reuse({c: Up("c", Reuse({a: Up("a", Reuse({d: New(1)}))}))}))}))

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

shouldBeEqual(apply(Fork(0, 1, New([Up(Offset(0, 0), Down(2))]), Reuse()), ["a", "b", "c", "d", "e"]), ["c", "a", "b", "c", "d", "e"]);

testAndThen(
  Fork(3, 1, Down(0), Reuse({1: New(5)})),
  Fork(2, 2, Reuse({0: New([Up(0, Offset(0, 2), Down(3))])}), New([1, 2, 3])),
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
 
// TODO, line 108, restore the Fork / Concat, no the inner Reuse
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
  Fork(2, 2, Reuse(
    {0: Up(0, Offset(0, 2), Down(3)),
     1: Up(1, Offset(0, 2), Down(2))}),
             Reuse(
    {0: Up(0, Offset(2), Down(1)),
     1: Up(1, Offset(2), Down(0))}))),
  Fork(2, 2, Reuse(
    {0: Up(0, Offset(0, 2), Down(1)),
     1: Up(1, Offset(0, 2), Down(2))}), Reuse(
    {0: Up(0, Offset(2), Down(3)),
     1: Up(1, Offset(2), Down(0))})))


testAndThen(
  Reuse({0: Up(0, Down(2)), 2: Up(2, Down(0))}),
  Fork(2, 1, New([Up(Offset(0, 2), Down(4))]),
             Reuse({2: Up(2, Offset(2), Down(3))})),
  ["a", "b", "c", "d", "e"]);
/*==Fork(2, 1, New([Up(Offset(-2, 2), Down(1))]),Reuse({
    1: Up(1, Offset(2), Down(4)),
    2: Up(2, Offset(2), Down(3))}))
  */
  
/*
  Fork(2, 1, New([Up(Offset(0, 2), Down(3))]),
             Reuse({1: Up(1, Offset(2), Down(4)),
                    2: Up(2, Offset(2), Down(3))
             })))
*/
// [a, b|in, c, d, e]
// => [e|out, c, d, d]
// => [d, c, e, d]
  
testAndThen(
  Fork(0, 1, New([Up(Offset(0, 0), Down(0))]), Reuse()),
  Fork(0, 1, New([Up(Offset(0, 0), Down(5))]), Reuse()),
  "ABCDEFGH"
);
// = Insert(1, New([Down(5)]),Insert(1, Down(Offset(0, 0), New([Up(Offset(0, 0), Down(5))])),Reuse()))

testAndThen(
  Fork(2, 2, Reuse(), Fork(0, 1, New([Up(Offset(2, 0), Down(0))]), Reuse())),
  Fork(0, 1, New([Up(Offset(0, 0), Down(5))]), Reuse()),
  ["A", "B", "C", "D", "E", "F", "G"]
);

testAndThen(
  Keep(2, Fork(0, 1, New([Up(Offset(2, 0), Down(0))]), Reuse())),
  Fork(0, 1, New([Up(Offset(0, 0), Down(5))]), Reuse()),
  ["A", "B", "C", "D", "E", "F", "G"]
);

testAndThen(
  Keep(3, Fork(0, 1, New([Up(Offset(3, 0), Down(1))]), Reuse())),
  Keep(1, Fork(0, 1, New([Up(Offset(1), Down(5))]), Reuse())),
  ["A", "B", "C", "D", "E", "F", "G"]
); 

// TODO: Could optimize the result of andThen?
testAndThen(
  Reuse({a: Keep(3, Reuse({0: New(1)}))}),
  Reuse({a: Insert(4, Up("a", Down("b")), Reuse())}),
  {a: [0, 1, 2, 3], b: [4, 5, 6, 7]});
/*
= Reuse({
  a: Insert(3,
       Up("a", Down("b", Offset(0, 3))),
       Insert(1,
         Up("a", Down("b", Offset(3), Reuse({
           0: New(1)}))),Reuse()))})

= it would be nice but probably hard to simplify to:

Reuse({
  a: Insert(4,
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
=Fork(3, 3,   --Concat(3, Down(Offset(0, 3), |), Down(Offset(3), |))
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
    Reuse({a: Concat(1, Down(Offset(0, 1)), Concat(2, New([8, 9]), Down(Offset(1))))}),
    Reuse({a: Concat(0, Up("a", Down("b")), New([1, 2]))})),
    Reuse({
  a: Concat(1,  Concat(0, Up("a", Down("b")), New([1])), Insert(2, New([8, 9]), New([2])))})
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
    Reuse({a: New({b: Up("a", Down("c")), d: Reuse()})}),
    Reuse({a: New(3)})
  ),
  Reuse({a: New({b: Up("a", Down("c")), d: New(3)})})
);

shouldBeEqual(
  merge(
    New({
      a: Reuse({
        b: New(3)})}),
    Reuse({
      b: New({
        e: Reuse(),
        d: Up("b", Down("c"))})})
  ),
  New({
    a: Reuse({
      b: New({
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
    Down(Offset(2, 5), Reuse({4: New(1)})),
    Down(Offset(3), Reuse({2: New(2), 5: New(3)})),
  ),
  Down(Offset(3, 4), Reuse({2: New(2), 3: New(1)}))
);

shouldBeEqual(
  merge(
    Reuse({0: Up(0, Down(3))}),
    Keep(2, Delete(2))
  ),
  Fork(2, 2, Reuse({0: Up(0, Offset(0, 2), Down(3))}), Delete(2))
);

shouldBeEqual(
  merge(
    Keep(2, Delete(2)),
    Reuse({0: Up(0, Down(3))})
  ),
  Fork(2, 2, Reuse({0: Up(0, Offset(0, 2), Down(3))}), Delete(2))
);

shouldBeEqual(
  merge(
    Keep(5, Delete(1)),
    Delete(2)
  ),
  Delete(2, Keep(3, Delete(1)))
);

shouldBeEqual(
  merge(
    Delete(2),
    Keep(5, Delete(1))
  ),
  Delete(2, Keep(3, Delete(1)))
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
    Fork(1, 2, New([1, Down(0)]), Reuse({2: Reuse({d: New(1)})})),
    Down(3)
  ),
  Down(Offset(1), 2, Reuse({
    d: New(1)}))
);

shouldBeEqual(
  merge(
    Down(3),
    Fork(1, 2, New([1, Down(0)]), Reuse({2: Reuse({d: New(1)})}))
  ),
  Down(Offset(1), 2, Reuse({
    d: New(1)})) // Until it can be simplified.
);

shouldBeEqual(
  merge(
    Fork(3, 2, New([1, Down(0)]), Reuse({0: New(1), 1: New(3)})),
    Down(Offset(1, 3))
  ),
  Fork(3, 2, New([1, Down(0)]), Down(Offset(0, 1), Reuse({0: New(1)})))
);

shouldBeEqual(
  merge(
    Fork(3, 2, New([1, Down(0)]), Reuse({0: New(1), 1: New(3)})),
    Down(Offset(3, 1))
  ),
  Down(Offset(3, 1), Reuse({0: New(1)}))
);

shouldBeEqual(
  merge(
    Fork(1, 2, New([1, 2]), Reuse({1: Reuse({b: New(5)})})),
    Fork(3, 3, Reuse({2: Reuse({c: New(6)})}), New([2]))
  ),
  Fork(1, 2, New([1, 2]), Fork(2, 2, Reuse({1: Reuse({b: New(5), c: New(6)})}),  New([2])))
);

shouldBeEqual(
  merge(
    Fork(3, 3, Reuse({2: Reuse({c: New(6)})}), New([2])),
    Fork(1, 2, New([1, 2]), Reuse({1: Reuse({b: New(5)})}))
  ),
  Fork(1, 2, New([1, 2]), Fork(2, 2, Reuse({1: Reuse({c: New(6), b: New(5)})}),  New([2])))
);

shouldBeEqual(
  merge(
    Insert(2, "ab"),
    Delete(3)
  ),
  Insert(2, "ab", Delete(3))
);

shouldBeEqual(
  merge(
    Keep(2, Delete(2)),
    Keep(4, Reuse({
        0: Reuse({
          0: New(7)})}))
  ),
  Keep(2, Delete(2, 
      Reuse({
        0: Reuse({
          0: New(7)})})))
);

function testBackPropagate(e, u, res, name) {
  shouldBeEqual(backPropagate(e, u), res, name);
}

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
  Down("x", "b", Reuse({a: Up("a", "b", Down("c"))})), New({wrap: New({wrap2: Reuse({a: New({d: Reuse()})})})}),
  Reuse({x: Reuse({b: New({wrap: New({wrap2: Reuse()})}),
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
    Insert(3, New("abc")),
  Keep(2, Insert(3, New("abc"))),
  "Insert after deletion with Down"
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
  Insert(1, New("a"), Reuse()),
    Keep(2, Insert(3, New("abc"))),
  Keep(1, Insert(3, New("abc")))
)

testBackPropagate(
  Reuse({c: Down(Offset(10))}),
    Reuse({b: Up("b", Down("c", Delete(5)))}),
  Reuse({
  b: Up("b", Down("c", Offset(15)))})
);

testBackPropagate(
  Reuse({c: Down(Offset(10))}),
    Reuse({c: Delete(5)}),
  Reuse({
  c: Keep(10, Delete(5))})
);

testBackPropagate(
  Reuse({c: Delete(3), x: Delete(2)}),
    Reuse({d: Concat(2, Up("d", Down("c", Delete(5))), Up("d", Down("x", Keep(7, Delete(3)))))}),
  Reuse({
  d: Concat(2, Up("d", Down("c", Offset(8))), Up("d", Insert(7, Down("x",  Delete(2, Down(Offset(0, 7)))), Down("x", Offset(12)))))})
);

testBackPropagate(
  Reuse({a: New({x: Reuse({z: New(2)}), y: New(2)})}),
    Reuse({b: Up("b", Down("a"))}),
  Reuse({b: Up("b", Down("a", New({x: Reuse(), y: New(2)})))})
)

testBackPropagate(
  Delete(2),
  Insert(3, "abc"),
  Keep(2, Insert(3, "abc")),
  "Insertion after deletion"
);

testBackPropagate(
  Keep(2, Delete(2)),
  Keep(2, Insert(3, "abc")),
  Keep(4, Insert(3, "abc")),
  "Insertion to the right of a deletion"
);

testBackPropagate(
  Keep(2, Delete(2)),
  Fork(2, 5, Keep(2, Insert(3, "abc")), Reuse()),
  Keep(2, Insert(3, "abc")),
  "Insertion to the left of a deletion"
);

testBackPropagate(
  Fork(3, 3, Reuse({0: Up(0, Down(1))}), Reuse({1: Up(1, Down(0))})),
    Down(Offset(2, 1)),
  Delete(2, Keep(1, Down(Offset(0, 0))))
);

testBackPropagate(
  Fork(3, 3, Reuse({0: Up(0, Down(1))}), Reuse({1: Up(1, Down(0))})),
    Down(Offset(2, 2)),
  Delete(2, Keep(2, Down(Offset(0, 0))))
);

testBackPropagate(
  Keep(2, Delete(1)),
    Delete(3),
  Delete(2, Keep(1, Delete(1)))
);

testBackPropagate(
  Reuse({a: Delete(2)}),
    Reuse({a: Delete(3)}),
  Reuse({a: Keep(2, Delete(3))})
);

// ["a", "b", "c", "d", ["e"], "f", "g"]
// -> ["c", "d", "e", "f",|out "a",|in "b"]
// =>           [7,    2,      "a"]
// ==> Deleted["c","d"], replaced "e" by 7 and "f" by 2, deleted ["g"]
// => Keep(2, Delete(2, Fork(2, 2, Reuse({0: Reuse({0: New(7)}), 1: New(2)}), Down(Offset(0, 0)))))
testBackPropagate(
  Delete(2, Fork(4, 4, Reuse({2: Down(0)}), Up(Offset(6), Down(Offset(0, 2))))),
    Delete(2, Fork(3, 3, Reuse({0: New(7), 1: New(2)}), Down(Offset(0, 0)))),
  Keep(1, Delete(3,
    Fork(2, 2,
      Reuse({
        0: Reuse({
          0: New(7)}),
        1: New(2)}),
      Reuse()))));

ea = Reuse({a: Custom(Up("a", New([Down("x"), Down("y")])),
{
  name: "Addition",
  apply: ([x, y]) => x + y,
  update: (newEdit, oldInput, oldOutput) => {
    if(isIdentity(newEdit)) return newEdit;
    if(newEdit.ctor == editActions.Type.New) {
      return Reuse({0: newEdit.model - oldInput[1]});
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
  Delete(2, Fork(4, 4, Reuse({2: Down(0)}), Up(Offset(2)))),
    Fork(3, 3, Down(Offset(2, 1, 3), Reuse({0: New(7)})), Reuse()),
  Keep(2, Delete(2, Fork(1, 1,
      Reuse({
        0: Reuse({
          0: New(7)})}),
      Down(Offset(0, 0)))))
)

testBackPropagate(
  Reuse(),
    Keep(1, Delete(3, Keep(1, Delete(2)))),
  Keep(1, Delete(3, Keep(1, Delete(2))))
)

// TODO: It won't work with strings
// That's because the Delete makes it so it thinks he has to recover the value of the Fork, instead of trying to back-propagate the Fork. Here, the Fork should be like Reuse and stop the building of the edit action, and give it back to back-propagation.
testBackPropagate(
  Delete(3, Keep(2, Delete(2))),
    Keep(1, Delete(3, Keep(1, Delete(2)))),
  Keep(4, Delete(1, Keep(2, Delete(2, Keep(1, Delete(2))))))
)

testBackPropagate(
  Delete(5),
  Down(Offset(0, 2)),
  Keep(7, Down(Offset(0, 0))),
  "slice back-propagation"
);

testBackPropagate(
  Delete(5),
  Down(Offset(2, 4)),
  Keep(5, Delete(2, Keep(4, Down(Offset(0, 0))))),
  "slice back-propagation bis"
);
testBackPropagate(
  Delete(5),
  Delete(2, Keep(2, Down(Offset(0, 0)))),
  Keep(5, Delete(2, Keep(2, Down(Offset(0, 0))))),
  "slice back-propagation bis"
);

step = Keep(5,  // "Hello"
      Fork(6, 22,                      // " world"
        Insert(16,
          New(" big world, nice"),   // insertion
          Reuse()                    // " world"
        ),
      Keep(2, // The string "! "
      Insert(1, "?" // The inserted string "?"
      ))));
shouldBeEqual(apply(step, "Hello world! ?"), "Hello big world, nice world! ??")

e();
testBackPropagate(
  Reuse(Slice(5, 9)),
  Reuse(Slice(0, 2)),
  Reuse(Slice(5,7)),
  "slice back-propagation 2"
);
testBackPropagate(
  Reuse(Slice(5, 9)),
  Reuse(Remove(2)),
  Reuse(Remove(7,9)),
  "slice back-propagation 2"
);
testBackPropagate(
  Reuse({a: Reuse(up("a"), "b", Slice(5))}),
  Reuse({a: Reuse(Slice(0, 2))}),
  Reuse({b: Reuse(Slice(5, 7))}),
  "Slice backprop with up down"
);
testBackPropagate(
  Reuse({a: Reuse(Slice(5))}),
  Reuse({b: Reuse(up("b"), "a", Slice(0, 2))}),
  Reuse({b: Reuse(up("b"), "a", Slice(5, 7))}),
  "Slice backprop with up down"
);
testBackPropagate(
  Reuse("b", Slice(2, 7)),
  Reuse(Slice(3, 5)),
  Reuse({b: Reuse(Slice(5,7))}),
  "Slice backprop with one down"
);
testBackPropagate(
  Reuse("b", Slice(2, 7)),
  Reuse(Remove(0, 3, 5)),
  Reuse({b: Reuse(Remove(2, 5))}),
  "Slice backprop with one down 2"
);

// In this case, we modify the array on-place, so we back-propagate the modification.

testBackPropagate(
  Reuse({a: Concat(5,
    Reuse(up("a"), "b", Slice(2, 7)),
    Reuse(Slice(4, 6)))}),
  Reuse({a: Reuse(Remove(0, 3, 6))}),
  Reuse({b: Reuse(Remove(2,5)),
         a: Reuse(Remove(5,6))}),
  "Case Concat Reuse Slice 1"
);
testBackPropagate(
  Reuse({a: Concat(5,
    Reuse(up("a"), "b", Slice(2, 7)),
    Reuse(Slice(4, 6)))}),
  Reuse({a: Reuse(Slice(3, 6))}),
  Reuse({b: Reuse(Slice(5,7)),
         a: Reuse(Slice(4,5))}),
  "Case Concat Reuse Slice 1 strict"
);
testBackPropagate(
  Reuse({a: Reuse(up("a"), "b", Remove(0, 2, 7))}),
  Reuse({c: Reuse(up("c"), "a", Slice(3, 5))}),
  Reuse({c: Reuse(up("c"), "b", Slice(5, 7))}),
  "Case Concat Reuse Slice 2 premise"
);
testBackPropagate(
  Reuse({a: Reuse(Remove(0, 4, 6))}),
  Reuse({c: Reuse(up("c"), "a", Slice(0, 1))}),
  Reuse({c: Reuse(up("c"), "a", Slice(4, 5))}),
  "Case Concat Reuse Slice 2 premise 2"
);
// In this case, we import another array, so we just need to find how to import the same array in the program.
testBackPropagate(
  Reuse({a: Concat(5,
    Reuse(up("a"), "b", Remove(0, 2, 7)),
    Reuse(Remove(0, 4, 6)))}),
  Reuse({c: Reuse(up("c"), "a", Slice(3, 6))}),
  Reuse({c: Concat(2, Reuse(up("c"), "b", Slice(5, 7)),
                      Reuse(up("c"), "a", Slice(4, 5)))
         }),
  "Case Concat Reuse Slice 2"
);
// Problem: Instead of keeping the "slice" from which we obtained "b" for "c", it instead back-propagates the Remove action to b (remove elements 2 to 5) and reuse b and apply the removal.
// The problem is that it makes sense, but it's not what we want.
// Are Slice and Remove different?
// We took a portion of b, we removed 2 to 5 to it as well as stopped at 8 (but we did not know that the two elements were removed in the view)
// We took a portion of c, we removed everything except the first element, which was actually the fourth element of c.


//Simple operators, and prove that if a certain form it always simplify?
//up(x), down(y), Remove(portions), Reuse({fi: op}), New(x)
// For example, Reuse("a", {x: Reuse(up("x"), down("y")}) is actually down("a"),Reuse({x: up("x"),down("y") })
// The path is no longer inside Reuse or New, it's actually the Reuse or New which is inside a path edit action.
// Path(path, relative edit action)
// Can we do merge, andThen, back-propagate on that?
// Path(p, Concat(x, 1, 2)) = Concat(x, Path(p, 1), Path(p, 2))
//  ==> Avoid duplicating paths in concat.
// apply(Path(path, ed), prog, progCtx) = [prog2, progCtx2] = walkPath(path, prog, progCtx), apply(ed, prog, progCtx)
// Reuse("abc") becomes Path("abc", Reuse()) = Path("abc")
// Now it makes sense to see back-propagate to back-propagate something if the diff has a Path that was not simplified.
// There, we want to do the conversion again.
// How to ensure it works with Remove?
//

testBackPropagate(
  Concat(4, Reuse(Slice(0, 4)),
         Reuse(Slice(5))),
  Reuse(Remove(2)),
  Reuse(Remove(2,4,5)), "Reinject the omitted element"
);
testBackPropagate(
  Concat(4, Reuse(Slice(0, 4)),
         Reuse(Slice(5))),
  Reuse(Slice(6,8)),
  Reuse(Slice(7,9)), "Shifted slice"
);
s();
testBackPropagate(
  Concat(4, Reuse(Slice(0, 4)),
         Reuse(Slice(5))),
  Reuse(Slice(2,8)),
  Reuse(Slice(2,4,5,9)), "Spanning slice"
);
e();
testBackPropagate(
  Reuse({a: Concat(4, Reuse(up("a"), "b", Slice(0, 4)),
    Reuse(Slice(5)))}),
  Reuse({a: Reuse(Slice(6,8))}),
  Reuse({
    b: Reuse(Slice(4)),
    a: Reuse(Remove(5,7,9))}),
  "Shifted slice on separate branches"
);

testBackPropagate(
  Reuse({a: Concat(4, Concat(2, Reuse(up("a"), "b", Slice(1, 3)), Reuse(up("a"), "c", Slice(0, 2))),
    Reuse(Slice(5)))}),
  Reuse({a: Reuse(Slice(6,8))}),
  Reuse({
    b: Reuse(Remove(1,3)),
    c: Reuse(Slice(2)),
    a: Reuse(Remove(5,7,9))}),
  "Shifted slice on separate branches"
);

testBackPropagate(
  Concat(4, Reuse(Slice(0, 4)),
         1, New("X"),
         Reuse(Slice(4))),
  Reuse(Slice(6,8)),
  Reuse(Slice(5,7)), "Shifted slice again"
);
testBackPropagate(
  Reuse(Remove(4, 5)),
  Reuse(Remove(1,2,3)),
  Reuse(Remove(1,2,3,4,5)),
  "right-aligned concat."
);
/*
Concat(4, Reuse(Slice(0, 4)),
          Reuse(Slice(5))),
   <-- Concat(2, Reuse(Slice(0, 2)), Reuse(Slice(1, 3)))
1) Concat(Reuse(Slice(0, 2)), Reuse(Slice(4, 5)))
2) Concat(Reuse(Slice(1, 3)), Reuse(Slice(4, 5)))
Result should be Concat(Reuse(Slice(0, 2)), Reuse(Slice(1, 3)), Reuse(Slice(4, 5)))
We cannot just blindly concatenate these results.



*/
testBackPropagate(
  Concat(4, Reuse(Slice(0, 4)),
         Reuse(Slice(5))),
  Reuse(Remove(2,6,8)),
  Reuse(Remove(2,4,5,7,9)),
  "back-Propagation of bigger concat"
);

testBackPropagate(
  Reuse(Slice(5)),
  Reuse(Slice(2)),
  Reuse(Remove(5, 7)),
  "slice back-propagation"
)

testBackPropagate(
  Reuse(Slice(5, 9)),
  Reuse(Slice(2)),
  Reuse(Remove(5, 7)),
  "slice back-propagation"
)


testBackPropagate(
  Concat(4, Reuse(Slice(0, 4)),
            Reuse(Slice(5))),
  Reuse(Slice(0, 6)),
  Reuse(Slice(0, 7)), "Concat to slice");

s();
testBackPropagate(
  Reuse(Remove(4, 5)),
  Reuse(Slice(0, 6), {5: New(1)}),
  Reuse(Slice(0, 7), {6: New(1)}), "Concat to slice");
e();



editActions.__debug = true;       
testBackPropagate(
  Concat(4, Reuse(Slice(0, 4)),
            Reuse(Slice(5))),
  Concat(6, Reuse(Slice(0, 6)),
         1, New("\""),
         Reuse(Slice(6))),
  Concat(7, Reuse(Slice(0, 7)),
         1, New("\""),
         Reuse(Slice(7)))
, "Concat Iterated");
finishTests(true);


e();

shouldBeEqual(
  Remove.portions.backPropagate([0, 3, 5, 7], [1, 4, 5, 7]), [4, 5, 7, 9, 10, 12], "removePortionsBackPropagate3")
shouldBeEqual(
  Remove.portions.andThen([0, 2, 3], [0, 2, 5]), [0, 4, 5], "andThenRemove1")
shouldBeEqual(
  Remove.portions.splitAt([0, 3, 5, 7], 4), [[0, 3], [1, 3], 1], "removePortionsSplitAt 1")
shouldBeEqual(
  Remove.portions.splitAt([0, 3, 5, 7], 2), [[0, 2], [0, 1, 3, 5], 0], "removePortionsSplitAt 2")
shouldBeEqual(
  Remove.portions.splitAt([1, 3, 5, 7], 2), [[1, 2], [0, 1, 3, 5], 1], "removePortionsSplitAt 3")
shouldBeEqual(
  Remove.portions.splitAt([0, 3, 5], 6), [[0, 3, 5, 6], [0], 2], "removePortionsSplitAt 1")
shouldBeEqual(
  Remove.portions.merge([0, 1, 5], [0, 3]), [0, 3, 5],
"merge remove portions 1");
shouldBeEqual(
  Remove.portions.merge([0, 3], [0, 1, 5]), [0, 3, 5],
"merge remove portions 1");
shouldBeEqual(
  Remove.portions.merge([0, 3], [0, 1, 5]), [0, 3, 5],
"merge remove portions 1");
shouldBeEqual(
  Concat(3, New("abc"),New("de")), New("abcde")
);

shouldBeEqual(Concat(4, Reuse(Remove(0, 1, 5)), Reuse(Remove(0, 5,   8))), Reuse(Remove(0, 1, 8)), "optimize Concat")

shouldBeEqual(
  Concat(3, New([1, 2, 3]),New([4, 5])), New([1, 2, 3, 4, 5])
);

shouldBeEqual(
  path(Remove(2), Remove(1)), path(Remove(1)), "remove #1"
);
shouldBeEqual(
  path(Remove(0, 1), Remove(0, 2)), path(Remove(0, 3)), "remove #2"
);
shouldBeEqual(
  path(Remove(0, 1), Remove(2, 7)), path(Remove(0, 1, 3, 8)), "remove #4"
);
shouldBeEqual(
  path(Remove(2, 4), Remove(1, 4)), path(Remove(1, 6)), "remove #5"
);
shouldBeEqual(
  path(Remove(1, 2, 5, 6), Remove(7)), path(Remove(1, 2, 5, 6, 9)), "remove #6"
);
shouldBeEqual(
  path(Remove(3, 8, 9, 12), Remove(2)), path(Remove(2)), "remove #7"
);
shouldBeEqual(
  path(Remove(7, 12), Remove(4, 6, 8, 10)), path(Remove(4, 6, 7, 12, 13, 15)), "remove #8"
);
shouldBeEqual(
  path(Remove(7, 12), Remove(4, 7, 8, 10)), path(Remove(4, 12, 13, 15)), "remove #9"
);
shouldBeEqual(
  path(Remove(1, 3), Remove(2)), path(Remove(1, 3, 4)), "remove first two elements"
);
shouldBeEqual(
  path(Remove(1, 3), Remove(2, 5)), path(Remove(1, 3, 4, 7)), "remove first two elements"
);
shouldBeEqual(
  path(Remove(1, 3, 5, 6), Remove(2, 5)), path(Remove(1, 3, 4, 8)), "remove first two elements"
);

shouldBeEqual(
  path(Slice(3, 10), Slice(2, 4)),
  path(Slice(5, 7)),
  "Slice Concat 1"
);

shouldBeEqual(
  path(Slice(3, 10), Slice(2)),
  path(Slice(5, 10)),
  "Slice Concat 2"
)

shouldBeEqual(
  path(Slice(3), Slice(2, 4)),
  path(Slice(5, 7)),
  "Slice Concat 3"
)

shouldBeEqual(
  path(Slice(3, 10), Slice(2, 14)),
  path(Slice(5, 10)),
  "Slice Concat 4"
)

shouldBeEqual(
  path(Slice(3,), Slice(2)),
  path(Slice(5)),
  "Slice Concat 5"
)
shouldBeEqual(
  merge(Reuse(Remove(0,1, 5), {0: New(0), 3: New(2)}), Reuse(Remove(0, 3, 8), {0: New(1), 4: New(3)})),
  Reuse(Remove(0, 3, 5), {0: New(1), 1: New(2)}), "Merge two slices 1");
shouldBeEqual(
  merge(Reuse(Remove(0, 3,8), {0: New(1), 4: New(3)}), Reuse(Remove(0, 1, 5), {0: New(0), 3: New(2)})),
  Reuse(Remove(0, 3, 5), {0: New(1), 1: New(2)}), "Merge two slices 2");
shouldBeEqual(
  merge(Reuse(Remove(0,1,5), {0: New(0), 3: New(2)}), Reuse(Remove(0, 3), {0: New(1), 4: New(3)})),
  Reuse(Remove(0, 3, 5), {0: New(1), 1: New(2)}), "Merge two slices 3");
shouldBeEqual(
  merge(Reuse(Remove(0, 3), {0: New(1), 4: New(3)}), Reuse(Remove(0, 1,5), {0: New(0), 3: New(2)})),
  Reuse(Remove(0, 3, 5), {0: New(1), 1: New(2)}), "Merge two slices 4");
testMergeAndReverse(
  Reuse(Remove(0, 1,5)), Reuse(Remove(0, 6)),
  Reuse(Remove(0)), "Merge two slices 5");
testMergeAndReverse(
  Reuse(Remove(0, 5)), Reuse(Remove(0, 3, 7)),
  Reuse(Remove(0, 5, 7)), "Merge two slices 7");
testMergeAndReverse(
  Reuse(Remove(0, 3, 7)), Reuse(Remove(0, 5)),
  Reuse(Remove(0, 5, 7)), "Merge two slices 8");
testMergeAndReverse(
  Reuse(Remove(0, 5)), Reuse(Remove(0, 3)),
  Reuse(Remove(0, 5)), "Merge two slices 9");
testMergeAndReverse(
  Reuse(Remove(0, 3)), Reuse(Remove(0, 5)),
  Reuse(Remove(0, 5)), "Merge two slices 10");

testMergeAndReverse(
  Reuse(Remove(0, 5)), Concat(3, New("abc"), Reuse(Remove(0, 4))),
  Reuse(Remove(0, 5)), "insertion removed");
testMergeAndReverse(
  Reuse(Remove(0, 5)), Concat(3, New("abc"), Reuse(Remove(0, 5))),
  Concat(3, New("abc"), Reuse(Remove(0, 5))), "insertion kept"
);
testMergeAndReverse(
  Reuse(Remove(0, 5)), Concat(3, New("abc"), Reuse(Remove(0, 7))),
  Concat(3, New("abc"), Reuse(Remove(0, 7))), "insertion not removed"
);
testMergeAndReverse(
  Concat(Reuse(Remove(0, 4, 10)),Reuse(Remove(0, 1, 3))),
  Concat(3, New("abc"), Reuse(Remove(0, 4))),
  Concat(New("abc"), Reuse(Remove(0, 4, 10))), "insertion removed");

testMergeAndReverse(
  Concat(8, New("inserted"), Reuse(Remove(0, 4))),
  Reuse(Remove(0, 3)),
  Concat(8, New("inserted"), Reuse(Remove(0, 4))), "merge concat Remove");

shouldBeEqual(
  merge(Concat(10, Reuse(Remove(10)), Reuse(Remove(10))),
  Concat(5, Reuse(Remove(5)), 2, New("ab"), Reuse(Remove(0, 5)))),
  Concat(Concat(5, Reuse(Remove(5)), 2, New("ab"), Reuse(Remove(0, 5, 10))), Concat(5, Reuse(Remove(5)), 2, New("ab"), Reuse(Remove(0, 5, 10)))),
  "insert and duplicate"
);
shouldBeEqual(
  merge(Concat(New("abc"), Reuse()),
            Concat(Reuse(Slice(3, 5)),Reuse(Slice(0, 3)))),
  Concat(Reuse(Slice(3, 5)), Concat(New("abc"), Reuse(Slice(0, 3)))),
  "Permutation and insertion 1");
shouldBeEqual(
  merge(Concat(Reuse(Slice(3, 5)),Reuse(Slice(0, 3))),
            Concat(New("abc"), Reuse())),
  Concat(Reuse(Slice(3, 5)), Concat(New("abc"), Reuse(Slice(0, 3)))),
  "Permutation and insertion 2");

s();
testMergeAndReverse(
    Concat(8, New("inserted"), Reuse(Slice(1))),
    Concat(4, Reuse(Slice(0, 4)), 
      Concat(9, New("inserted2"),
                Reuse(Slice(4)))),
  Concat(10, Concat(8, New("inserted"),
                     Reuse(Slice(2, 4))),
       9, New("inserted2"),
          Reuse(Slice(4))), "merge concat concat 1");
e();
shouldBeEqual(
  merge(Concat(5, Reuse(Slice(0,5)), Reuse(Slice(7))),
    Concat(2, Reuse(Slice(0,2)), Reuse(Slice(4)))),
  Concat(3, Concat(2, Reuse(Slice(0, 2)),
                    Reuse(Slice(4, 5))),
          Reuse(Slice(7))),
  "Merge of two deletions"
);

testMergeAndReverse(
  Concat(8, Reuse(Slice(0, 8)), New("abc")),
  Concat(8, Reuse(Slice(1, 9)), Reuse(Slice(0, 1))),
  Concat(10, Concat(7, Reuse(Slice(1, 8)),
                     New("abc")),
           Reuse(Slice(0, 1))),
  "Permutation and insertion again"
);
shouldBeEqual(
  merge(Concat(5, Reuse(Slice(0,5)), Reuse(Slice(8))),
            Concat(7, Reuse(Slice(0,7)), Concat(3, New("abc"), Reuse(Slice(7))))),
  Concat(5, Reuse(Slice(0,5)), Reuse(Slice(8)))
);

shouldBeEqual(path(up("name", "body", "arg", "arg"), "arg", "body", "body", "arg"),
  {up: List.fromArray(["name", "body", "arg"]), down: List.fromArray(["body", "body", "arg"])}, "pathupdown")
shouldBeEqual(stringOf(New({a: New("1")})), "New({ a: \"1\"})");
shouldBeEqual(display(New({a: New("1")})), "[START]{==>{a: \"1\"}}");
shouldBeEqual(path(up("a"), "a"), path.identity, "path1");
shouldBeEqual(path(up("a"), path("a")), path.identity, "path1");

shouldBeEqual(display(Reuse()), "[START]{}");
shouldBeEqual(display(Reuse("a")), "[START]{==>A1\n  a: A1={}}");
shouldBeEqual(display(Reuse(up("a"))), "A1={\n  a: [START]{==>A1}}");
shouldBeEqual(display(Reuse({a: Reuse(up("a"))})), "[START]A1={\n  a: {==>A1}}");
shouldBeEqual(display(Reuse(up("a"), "b")), "{\n  a: [START]{==>A1},\n  b: A1={}}");
shouldBeEqual(display(New("1")), "[START]{==>\"1\"}");
shouldBeEqual(display(New({a: Reuse("b")})), "[START]{==>{a: A1}\n  b: A1={}}");
shouldBeEqual(display(New({a: New({b: Reuse("b"), c: Reuse(up("x"), "c")})})),
  "{\n  x: [START]{==>{a: {b: A1, c: A2}}\n    b: A1={}},\n  c: A2={}}");
shouldBeEqual(display(New({a: Reuse(up("b"))})), "A1={\n  b: [START]{==>{a: A1}}}");


shouldBeEqual(path("a", "b", up("b", "a")), path.identity, "path1");
shouldBeEqual(path(up("b", "a"), "a", "b"), path.identity, "path2");
shouldBeEqual(path(up("b", "a"), "a", "c"), path(up("b"), "c"), "path3");
shouldBeEqual(path("a", "c", up("c"), "b"), path("a", "b"), "path4");
shouldBeEqual(path("a", up("a", "b")), up("b"), "path5");
shouldBeEqual(path("a", up("a", "b", "c")), up("b", "c"), "path5b");
shouldBeEqual(path("a", "b", "c", up("c", "b")), path("a"), "path6");
shouldBeEqual(path(up("a", "b"),"b"), up("a"), "path7");
shouldBeEqual(path(up("c", "b"), "b", "c", "a"), path("a"), "path8");

shouldBeEqual(pathChildEditActions(["a", "b", up("b", "a")]), [path.identity, {}], "path1-child");
shouldBeEqual(pathChildEditActions([up("b", "a"), "a", "b"]), [path.identity, {}], "path2-child");
shouldBeEqual(pathChildEditActions([up("b", "a"), "a", "c"]), [path(up("b"), "c"), {}], "path3-child");
shouldBeEqual(pathChildEditActions(["a", "c", up("c"), "b"]), [path("a", "b"), {}], "path4-child");
shouldBeEqual(pathChildEditActions(["a", up("a", "b")]), [up("b"), {}], "path5-child");
shouldBeEqual(pathChildEditActions(["a", up("a", "b", "c")]), [up("b", "c"), {}], "path5-child");
shouldBeEqual(pathChildEditActions(["a", "b", "c", up("c", "b")]), [path("a"), {}], "path6-child");
shouldBeEqual(pathChildEditActions([up("a", "b"),"b"]), [up("a"), {}], "path7-child");
shouldBeEqual(pathChildEditActions([up("c", "b"), "b", "c", "a"]), [path("a"), {}], "path8-child");
shouldBeEqual(pathChildEditActions([{up: undefined, down: New(1)}]), [path.identity, {up: undefined, down: New(1)}], "path0-child");

shouldBeEqual(path(Slice(2, 5), 1), path(3), "No field after slice");
shouldBeEqual(path(Slice(2, 5), path(1)), path(3), "No field after slice");
shouldBeEqual(path(Slice(2, 5), Slice(1, 3), up(Slice(3, 5))), path.identity, "path with slices");
shouldBeEqual(pathChildEditActions([Slice(2, 5), Slice(1, 3), up(Slice(3, 5))]), [path.identity, {}], "path with slices - with edit actions");
shouldBeEqual(pathChildEditActions([Slice(2, 5), 1]), [path(3), {}], "No field after slices - with edit actions");
shouldBeEqual(pathChildEditActions([Slice(2, 5), path(1)]), [path(3), {}], "No field after slices - with edit actions");

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
         {body: Reuse("arg",
           {body: Reuse(up("body", "arg"), "arg", "body", 
             {body: Reuse(up("body", "body", "arg"),
               {arg: Reuse(up("arg"), "arg", "arg", "body",
                 {name: Reuse(up("name", "body", "arg", "arg"), "arg", "body", "body", "arg")}),
                body: Reuse(up("body", "body"), "arg", "body",
                 {argName: New("a"),
                  arg: Reuse({fun: Reuse(up("fun", "arg", "body", "arg"), "body", "body", "arg"),
                              arg: Reuse(up("arg", "arg", "body", "arg"), "body", "body", "arg")}),
                  body: Reuse({fun: New("a")})})})})})});
var step = Reuse(
         {body: Reuse(
           {body: Reuse(
             {body: Reuse("body", 
               {arg: Reuse(
                 {fun: Reuse(up("fun", "arg", "body"), "arg", "name"),
                  arg: Reuse(up("arg", "arg", "body"), "arg", "name")})})})})});

var globalStep2 = Reuse(
  {body: Reuse("arg",
    {body: Reuse(
      {body: Reuse(up("body", "body", "arg", "body"), "arg", "body",
        {arg: Reuse(
          {fun: Reuse(up("fun"), up("arg"), up("body"), /*<+*/up("arg"), "body",/*+>*/ "arg", "body", "body", "arg"),
           arg: Reuse(up("arg"), up("arg"), up("body"), /*<+*/up("arg"), "body",/*+>*/ "arg", "body", "body", "arg")}),
         argName: New("a"),
         body: Reuse({fun: New("a")})})})})});

//Reuse({
//  body: Reuse("arg", {
//    body: Reuse({
//      body: Reuse(up("body", "body", "arg", "body"), "arg", "body", {
//        argName: New("a"),
//        arg: Reuse({
//          fun: Reuse(up("fun"), up("arg"), up("body"), /*<+*/up("arg"), "body",/*+>*/ "arg", "body", "body", "arg"),
//          arg: Reuse(up("arg"), up("arg"), up("body"), /*<+*/up("arg"), "body",/*+>*/ "arg", "body", "body", "arg")
//        })
//      }) }) }) });

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
    Reuse({body: Reuse(up("body"))}),
    New({ body: Reuse("a", "b")})
  ),
  New({ body: New({ body: Reuse("a", "b")})})
);

shouldBeEqual(
  andThen(
    Reuse({body: Reuse({fun: Reuse(up("fun"), up("body"), "arg")})}),
    New({ 
      arg: Reuse("c"),
      body: Reuse({fun: Reuse(up("fun"))})})
  ),
  New({ 
      arg: Reuse("c"),
      body: Reuse({fun: Reuse(up("fun"), "c")})})
);

shouldBeEqual(
  andThen(
    Reuse({body: Reuse({fun: Reuse({fun2: Reuse(up("fun2"), up("fun"), up("body"), "arg")})})}),
    New({ 
      arg: Reuse("c"),
      arg2: Reuse("d"),
      body: Reuse({fun: Reuse({ fun2: Reuse(up("fun2"), up("fun"), {arg2: Reuse(up("arg2"))})})})})
  ),
  New({ 
      arg: Reuse("c"),
      arg2: Reuse("d"),
      body: Reuse({fun: Reuse({ fun2: Reuse(up("fun2"), up("fun"), "c")})})})
);


shouldBeEqual(
  andThen(
    Reuse({body: Reuse({fun: Reuse(up("fun"), up("body"), "arg")})}),
    New({ 
      arg: Reuse("c"),
      body: Reuse("a")})
  ),
  New({ 
      arg: Reuse("c"),
      body: Reuse("a", {fun: Reuse(up("fun"), up("a"), "c")})})
);

shouldBeEqual(
  andThen(
    Reuse({body: Reuse({fun: Reuse(up("fun"), up("body"), "arg")})}),
    New({ 
      arg: Reuse("c"),
      body: Reuse("a", "b")})
  ),
  New({ 
      arg: Reuse("c"),
      body: Reuse("a", "b", {fun: Reuse(up("fun"), up("b"), up("a"), "c")})})
);

shouldBeEqual(
  andThen(
    Reuse({body: Reuse({fun: Reuse(up("fun"), up("body"), "arg")})}),
    New({ 
      arg: Reuse("c"),
      body: Reuse("a", "b")})
  ),
  New({ 
      arg: Reuse("c"),
      body: Reuse("a", "b", {fun: Reuse(up("fun"), up("b"), up("a"), "c")})})
);

shouldBeEqual(
  andThen(
    Reuse({c: Reuse({e: Reuse({f: Reuse(up("f"), up("e"), up("c"), "a")})})}),
    New({a: Reuse("b"), c: Reuse("d")})),
  New({a: Reuse("b"), c: Reuse("d", {e: Reuse({f: Reuse(up("f"), up("e"), up("d"), "b")})})}));

shouldBeEqual(
  andThen(
    Reuse({c: Reuse({e: Reuse(up("e"), up("c"), "a")})}),
    New({a: Reuse("b"), c: Reuse("d")})),
  New({a: Reuse("b"), c: Reuse("d", {e: Reuse(up("e"), up("d"), "b")})}));

shouldBeEqual(
  andThen(
    Reuse({body: Reuse({fun: Reuse({fun: Reuse(up("fun"), up("fun"), up("body"), "arg"),
                                    arg: Reuse(up("arg"), up("fun"), up("fun"), "arg")})})}),
    New({ ctor: "let",
      argName: Reuse("fun", "argName"),
      arg: Reuse("arg", "arg"),
      body: Reuse("fun", "body")})
  ),
  New({ ctor: "let",
      argName: Reuse("fun", "argName"),
      arg: Reuse("arg", "arg"),
      body: Reuse("fun", "body", {fun: Reuse({fun: Reuse(up("fun"), up("fun"), up("body"), up("fun"), "arg", "arg"),
                                              arg: Reuse(up("arg"), up("fun"), up("body"), up("fun"), "arg", "arg")})})})
);

shouldBeEqual(
  andThen(
    Reuse("fun", "body", {fun: Reuse({fun: Reuse(up("fun"), up("fun"), up("body"), up("fun"), "arg"),
                                      arg: Reuse(up("arg"), up("fun"), up("body"), up("fun"), "arg")})}),
    Reuse({arg: Reuse("arg")})
  ),
  Reuse("fun", "body", {fun: Reuse({fun: Reuse(up("fun"), up("fun"), up("body"), up("fun"), "arg", "arg"),
                                    arg: Reuse(up("arg"), up("fun"), up("body"), up("fun"), "arg", "arg")})})
)

shouldBeEqual(
  Concat(0, New([]), Reuse()),
  Reuse(),
  "Concat simplify 1"
);

shouldBeEqual(
  apply(Reuse(Slice(3, 7)), [0, 1, 2, 3, 4, 5, 6, 7, 8]),
  [3, 4, 5, 6],
  "Slice"
);

shouldBeEqual(
  apply(Concat(2, Reuse(Slice(3, 5)), Reuse(Slice(6, 7))), [0, 1, 2, 3, 4, 5, 6, 7, 8]),
  [3, 4, 6],
  "Concat normal"
)

shouldBeEqual(
  apply(Concat(3, Reuse(Slice(3, 5)), Reuse(Slice(6, 7))), [0, 1, 2, 3, 4, 5, 6, 7, 8]),
  [3, 4, undefined, 6],
  "Concat inflated without filler"
)

shouldBeEqual(
  apply(Concat(3, Reuse(Slice(3, 5)), Reuse(Slice(6, 7)), 1), [0, 1, 2, 3, 4, 5, 6, 7, 8]),
  [3, 4, 1, 6],
  "Concat inflated with filler"
)

shouldBeEqual(
  apply(Concat(1, Reuse(Slice(3, 5)), Reuse(Slice(6, 7))), [0, 1, 2, 3, 4, 5, 6, 7, 8]),
  [3, 6],
  "Concat deflated"
)

shouldBeEqual(
  apply(Concat(2, Reuse(Slice(3, 5)), 1, Reuse(Slice(6, 7)), Reuse(Slice(0, 2))), [0, 1, 2, 3, 4, 5, 6, 7, 8]),
  [3, 4, 6, 0, 1],
  "Concat multiple"
)

shouldBeEqual(
  andThen(Concat(1, New([1]), Reuse()), Reuse(Slice(1))),
  Concat(1, New([1]), Reuse(Slice(1))),
  "Non-reversible Concat"
)

shouldBeEqual(
  andThen(Reuse(Slice(1)), Concat(1, New([1]), Reuse())),
  Reuse(),
  "Reversible Concat"
)

shouldBeEqual(
  andThen(Concat(3, Reuse(Slice(2, 5)), Reuse(Slice(0, 2))),
          Concat(2, Reuse(Slice(3, 5)), Reuse(Slice(0, 3)))),
  Reuse(Slice(0, 5)),
  "Simplification of two anti-permutations"
)
shouldBeEqual(
  andThen(Concat(3, Reuse(Slice(2, 5)), Reuse(Slice(0, 2))),
          Concat(3, Reuse(Slice(2, 5)), Reuse(Slice(0, 2)))),
  Concat(1, Reuse(Slice(4, 5)), Reuse(Slice(0, 4))),
  "Simplification of permutations"
)

editActions.__debug = true;       
testBackPropagate(
  Concat(4, Reuse(Slice(0, 4)),
         2, Reuse(Slice(5, 7)),
            Reuse(Slice(9))),
  Concat(17, Reuse(Slice(0, 17)),
         1, New("\""),
         Reuse(Slice(18))),
  Concat(20, Reuse(Slice(0, 20)),
         1, New("\""),
         Reuse(Slice(21)))
, "Concat Multiple");
finishTests(true);

step = Reuse({1: Reuse({2: Concat(4, Reuse(Slice(0, 4)),
                                  2, Reuse(Slice(5, 7)),
                                     Reuse(Slice(9)))})});
user = Reuse({1: Reuse({2: Concat(17, Reuse(Slice(0, 17)),
                                  1, New("\""),
                                  5, Reuse(Slice(18, 23)),
                                  1, New("\""),
                                  49, Concat(45, Reuse(Slice(24,69)),
                                            1, New("\""),
                                            Reuse(Slice(70,73))),
                                  1, New("\""),
                                  57, Reuse(Slice(73, 130)),
                                  1, New("\""),
                                  3, Reuse(Slice(131, 134)),
                                  1, New("\""),
                                  46, Reuse(Slice(135, 181)),
                                  1, New("\""),
                                  3, Reuse(Slice(182, 185)),
                                  1, New("\""), Reuse(Slice(186)))})});
editActions.__debug = true;
testBackPropagate(step, user,
        Reuse({1: Reuse({2: Concat(20, Reuse(Slice(0, 20)),
                                   
                                   1, New("\""),
                                   5, Reuse(Slice(21, 26)),
                                   1, New("\n"),
                                   49, Concat(45, Reuse(Slice(27,72)),
                                             1, New("\""),
                                             Reuse(Slice(73,76))),
                                   1, New("\""),
                                   57, Reuse(Slice(76, 133)),
                                   1, New("\""),
                                   3, Reuse(Slice(134, 137)),
                                   1, New("\""),
                                   46, Reuse(Slice(138, 184)),
                                   1, New("\""),
                                   3, Reuse(Slice(185, 188)),
                                   1, New("\""), Reuse(Slice(189)))})}), "editActionOutLength == 0");
finishTests(true);

/*
shouldBeEqual(
  andThen(
  Reuse({array: ReuseArray(1, Reuse(), 2, New([]), Reuse())}),
  Reuse({array:
  ReuseArray(2, Reuse(), ReuseArray(up, "array2", 3, Reuse(), New([])))})),
  Reuse({array:
    ReuseArray(1, Reuse(), ReuseArray(up, "array2", 1, New([]), 2, Reuse(), New([])))
  })
);*/


var editStep = ReuseArray(5, Custom(Reuse(),
    {name: "test",
     apply: x=>x.slice(0, 2),
     update: outEdit => ReuseArray(2, outEdit, Reuse())}), Reuse());
var applied = apply(editStep, [1, 2, 3, 4, 5, 6, 7]);

testBackPropagate(
  editStep,
  ReuseArray(1, New([]), Reuse()),
  ReuseArray(1, New([]), Reuse()),
  "Do not slit custom"
)

testBackPropagate(
  editStep,
  ReuseArray(3, New([]), Reuse()),
  ReuseArray(2, New([]), ReuseArray(3, Reuse(), ReuseArray(1, New([]), Reuse()))), "Do not split custom 2")

//finishTests(true);

testBackPropagate(
  Custom(New([Reuse("a"), Reuse("b", "c")]),
  { name: "max",
    apply: x => x[0] > x[1] ? x[0] : x[1],
    update: outEdit => (Array.isArray(outEdit) ? nd.Reuse : Reuse)({1: outEdit})
  }),
  New(2),
  Reuse({b: Reuse({c: New(2)})})
);

shouldBeEqual(New({a: {b: 1}}), New({a: New({b: New(1)})}), "Wrap bare New");
shouldBeEqual(nd.New({a: {b: 1}}), nd.New({a: nd.New({b: nd.New(1)})}), "Wrap bare New nd");

shouldBeEqual(Reuse({a: 1}), Reuse({a: New(1)}), "Wrap New");
shouldBeEqual(nd.Reuse({a: 1}), nd.Reuse({a: nd.New(1)}), "Wrap New nd");
shouldBeEqual(Reuse({a: {b: 1}}), Reuse({a: New({b: New(1)})}), "Wrap New object")
shouldBeEqual(nd.Reuse({a: {b: 1}}), nd.Reuse({a: nd.New({b: nd.New(1)})}), "Wrap New object nd");
shouldBeEqual(Reuse({a: {b: Reuse("x")}}), Reuse({a: New({b: Reuse("x")})}), "Wrap New nested object");
shouldBeEqual(nd.Reuse({a: {b: nd.Reuse("x")}}), nd.Reuse({a: nd.New({b: nd.Reuse("x")})}), "Wrap New nested object nd");

                 
step = Reuse({1: Reuse({2: ReuseArray(4, Reuse(),
                                      1, New(""),
                                      2, Reuse(),
                                      2, New(""),
                                      Reuse())})});
user = Reuse({1: Reuse({2: ReuseArray(17, Reuse(),
                                       1, New("\""),
                                       5, Reuse(),
                                       1, New("\""),
                                       49, ReuseArray(45, Reuse(),
                                                      1, New("\""),
                                                         Reuse()),
                                       1, New("\""),
                                       57, Reuse(),
                                       1, New("\""),
                                       3, Reuse(),
                                       1, New("\""),
                                       46, Reuse(),
                                       1, New("\""),
                                       3, Reuse(),
                                       1, New("\""),
                                       Reuse())})});
testBackPropagate(step, user,
        Reuse({1: Reuse({2: ReuseArray(9, Reuse(),
                                       11, Reuse(),
                                       1, New("\""),
                                       5, Reuse(),
                                       1, New("\""),
                                       49, ReuseArray(45, Reuse(),
                                                      1, New("\""),
                                                         Reuse()),
                                       1, New("\""),
                                       57, Reuse(),
                                       1, New("\""),
                                       3, Reuse(),
                                       1, New("\""),
                                       46, Reuse(),
                                       1, New("\""),
                                       3, Reuse(),
                                       1, New("\""),
                                       Reuse())})}), "editActionOutLength == 0");

testBackPropagate(
  Reuse({2: Reuse({1: ReuseArray(1, Reuse(),
                                  0, New("\n"),
                                     Reuse())})}),
  ReuseArray(3, New({  0: Reuse(0),
                       1: New({ 0: "section",
                                1: New([]),
                                2: New([])}, []),
                       2: Reuse(1),
                       3: Reuse(2)}, []),
                 Reuse()),
  ReuseArray(3, New({  0: Reuse(0),
                       1: New({ 0: "section",
                                1: New([]),
                                2: New([])}, []),
                       2: Reuse(1),
                       3: Reuse(2)}, []),
                 Reuse()), "independend changes")
shouldBeEqual(editActions.diff(1, undefined), New(undefined));
shouldBeEqual(editActions.diff(undefined, 1), New(1));
shouldBeEqual(editActions.diff(undefined, [undefined], {maxCloneDown: 1}), New([Reuse()]))

var step =
  ReuseArray(2, New({ 0: Reuse(0),
                      1: Reuse(1)}, []),
                Reuse())

var edit =
  Reuse({0: New(42),
         1: New(54)});

testBackPropagate(step, edit, ReuseArray(2, Reuse({0: New(42), 1: New(54)}), Reuse()));

shouldBeEqual(merge(
             ReuseArray(0, New([1, 2]), Reuse()),
             ReuseArray(0, New([3, 4]), Reuse())),
           ReuseArray(0, New([1, 2]), 0, New([3, 4]), Reuse()), "merge ReuseArray 1");
shouldBeEqual(merge(
             ReuseArray(1, New([]), Reuse()),
             ReuseArray(0, New([3, 4]), Reuse())),
           ReuseArray(0, New([3, 4]), 1, New([]), Reuse()), "merge ReuseArray 2");
shouldBeEqual(merge(
             ReuseArray(0, New([1, 2]), Reuse()),
             ReuseArray(1, New([]), Reuse())),
           ReuseArray(0, New([1, 2]), 1, New([]), Reuse()), "merge ReuseArray 3");
shouldBeEqual(merge(
             ReuseArray(2, Reuse(), New([1])),
             ReuseArray(1, New([]), Reuse())),
           ReuseArray(1, New([]), 1, Reuse(), New([1])));
shouldBeEqual(merge(
             ReuseArray(1, New([]), Reuse()),
             ReuseArray(2, Reuse(), New([1]))),
           ReuseArray(1, New([]), 1, Reuse(), New([1])));
shouldBeEqual(merge(
             ReuseArray(3, Reuse({1: New(2)}), Reuse()),
             ReuseArray(2, Reuse({0: New(1)}), Reuse())),
           ReuseArray(2, Reuse({0: New(1), 1: New(2)}), ReuseArray(1, Reuse(), Reuse())));
shouldBeEqual(merge(
             ReuseArray(2, Reuse({0: New(1)}), Reuse()),
             ReuseArray(3, Reuse({1: New(2)}), Reuse())),
           ReuseArray(2, Reuse({0: New(1), 1: New(2)}), ReuseArray(1, Reuse(), Reuse())));

shouldCommute(New("1"), Reuse(), true, "Reuse() right");
shouldCommute(New("1"), New("2"), false, "Two New");
shouldCommute(ReuseArray(1, Reuse(), ReuseArray(1, New("a"), Reuse())),
              ReuseArray(1, New("b"), ReuseArray(1, Reuse(), New("c"))), true, "Two independent ReuseArray, keeping length");
shouldCommute(ReuseArray(1, Reuse(), ReuseArray(1, New("a"), Reuse())),
              ReuseArray(1, New("ab"), ReuseArray(1, Reuse(), New("c"))), false, "Two independent ReuseArray, the second one extending length");
shouldCommute(ReuseArray(1, Reuse(), ReuseArray(1, New("a"), Reuse())),
              ReuseArray(1, New(""), ReuseArray(1, Reuse(), New("c"))), false, "Two independent ReuseArray, the second one reducing length");
shouldCommute(ReuseArray(1, Reuse(), ReuseArray(1, New("ab"), Reuse())),
              ReuseArray(1, New("b"), ReuseArray(1, Reuse(), New("c"))), false, "Two independent ReuseArray, first one extending length");
shouldCommute(ReuseArray(1, Reuse(), ReuseArray(1, New(""), Reuse())),
              ReuseArray(1, New("b"), ReuseArray(1, Reuse(), New("c"))), false, "Two independent ReuseArray, first one reducing length");
shouldCommute(Reuse({0: New(1), 1: Reuse({2: New(3)})}),
              Reuse({1: Reuse({1: New(2)}), 3: Reuse({2: New(4)})}), true, "Independent Reuse");
shouldCommute(Reuse({0: New(1), 1: Reuse({2: New(3)})}),
              Reuse({0: Reuse({1: New(2)}), 3: Reuse({2: New(4)})}), false, "Non independent Reuse");
shouldCommute(Reuse({0: New(1), 1: Reuse({2: New(3)})}),
              Reuse({1: Reuse({2: New(2)}), 3: Reuse({2: New(4)})}), false, "Non independent Reuse inner");
shouldCommute(Reuse({0: Reuse(up("0"), 1)}), Reuse({1: New(1)}), false, "Reuse with outsideLevel > 0");

var a = 
  ReuseArray(2, ReuseArray(1, Reuse(),
                New("1")),
             Reuse());
var b = 
  ReuseArray(1, Reuse(),
             1, New("0"),
             Reuse());
shouldBeEqual(andThen(b, a),
  ReuseArray(2, ReuseArray(1, Reuse(), New("0")), Reuse()));

var d = ReuseArray(14, New({ 0: Reuse(0)  ,
                             1: Reuse(1),
                             2: Reuse(2),
                             3: Reuse(4),
                             4: Reuse(5),
                             5: Reuse(6),
                             6: Reuse(7),
                             7: Reuse(8),
                             8: Reuse(9),
                             9: Reuse(10),
                             10: Reuse(11),
                             11: Reuse(12),
                             12: Reuse(13)}, []),
                       Reuse());
var s = Reuse({13: Reuse({1: ReuseArray(1, Reuse(),
                                        0, New("\n"),
                                        Reuse())})})
shouldBeEqual(backPropagate(s, d), d);

var m1 = ReuseArray(47, New("A"), Reuse())
var m2 = ReuseArray(1, Reuse(),
           0, New(" "),
              Reuse())
var m3 = ReuseArray(1, Reuse(),
          1, New(" g"),
             Reuse())
var m4 = ReuseArray(3, Reuse(),
           0, New("r"),
              Reuse())
var m5 = ReuseArray(2, Reuse(),
           1, New("G"),
              Reuse());
var m45 = andThen(m5, m4);
shouldBeEqual(m45, ReuseArray(3, ReuseArray(2, Reuse(), New("G")), 0, New("r"), Reuse()), "m45");
var m345 = andThen(m45, m3);
shouldBeEqual(m345, ReuseArray(1, Reuse(), 1, New(" G"), 0, New("r"), Reuse()), "m345");
var m2345 = andThen(m345, m2);
shouldBeEqual(m2345, ReuseArray(1, Reuse(), 0, New(" G"), 0, New("r"), Reuse()), "m2345");
var m12345 = andThen(m2345, m1);
shouldBeEqual(m12345, ReuseArray(47, New("A"), 0, New(" G"), 0, New("r"), Reuse()), "m12345");

var m5b = ReuseArray(4, Reuse(),
           0, New(" "),
              Reuse())
var m6b = ReuseArray(4, Reuse(),
          1, New(" w"),
             Reuse())
var m7b = ReuseArray(6, Reuse(),
           0, New("o"),
              Reuse())
var m8b = ReuseArray(2, Reuse(),
           1, New("G"),
              Reuse());
var m7b8b = andThen(m8b, m7b);
shouldBeEqual(m7b8b, ReuseArray(6, ReuseArray(2, Reuse(),
                         1, New("G"),
                            Reuse()), 0, New("o"), Reuse()), "m7b8b");
var m6b7b8b = andThen(m7b8b, m6b);
shouldBeEqual(m6b7b8b, ReuseArray(4, ReuseArray(2, Reuse(),
                         1, New("G"),
                            Reuse()),
           1, New(" w"),
           0, New("o"), Reuse()), "m6b7b8b");

shouldBeEqual(
  andThen(
    ReuseArray(2, Reuse(), 1, New("G"), Reuse()),
    ReuseArray(47, New("A"),
           0, New(" g"),
           0, New("r"),
           Reuse())),
    ReuseArray(47, New("A"),
               0, New(" G"),
               0, New("r"), Reuse()));


shouldBeEqual(
  andThen(ReuseArray(1, Reuse(), 1, New("B"), Reuse()), ReuseArray(0, New(" b"), Reuse())),
  ReuseArray(0, New(" B"), Reuse()));

// Insertion followed by deletion of the same element.
//s()
//finishTests(true);
var p1 = "Hello world", p2 = "Hallo world", p3 = "Hallo wrld", p4 = "Hello wrld";
shouldBeEqual(apply(backPropagate(diff(p1, p2), diff(p2, p3)), p1), p4, "Modification then deletion");
var p1 = "Hello world", p2 = "Hllo world", p3 = "Hllo wrld";
shouldBeEqual(apply(backPropagate(diff(p1, p2), diff(p2, p3)), p1), p4, "Deletion then deletion");
var p1 = "Hello world", p2 = "Heillo world", p3 = "Heillo wrld";
shouldBeEqual(apply(backPropagate(diff(p1, p2), diff(p2, p3)), p1), p4, "Insertion then deletion");

var p1 = "Hello world", p2 = "Hallo world", p3 = "Hallo wourld", p4 = "Hello wourld";
shouldBeEqual(apply(backPropagate(diff(p1, p2), diff(p2, p3)), p1), p4, "Modification then insertion");
var p1 = "Hello world", p2 = "Hllo world", p3 = "Hllo wourld";
shouldBeEqual(apply(backPropagate(diff(p1, p2), diff(p2, p3)), p1), p4, "Deletion then insertion");
var p1 = "Hello world", p2 = "Heillo world", p3 = "Heillo wourld";
shouldBeEqual(apply(backPropagate(diff(p1, p2), diff(p2, p3)), p1), p4, "Insertion then insertion");

var p1 = "Hello world", p2 = "Hallo world", p3 = "Hallo warld", p4 = "Hello warld";
shouldBeEqual(apply(backPropagate(diff(p1, p2), diff(p2, p3)), p1), p4, "Modification then modification");
var p1 = "Hello world", p2 = "Hllo world", p3 = "Hllo warld";
shouldBeEqual(apply(backPropagate(diff(p1, p2), diff(p2, p3)), p1), p4, "Deletion then modification");
var p1 = "Hello world", p2 = "Heillo world", p3 = "Heillo warld";
shouldBeEqual(apply(backPropagate(diff(p1, p2), diff(p2, p3)), p1), p4, "Insertion then modification");

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
/*
editActions.debug(
  backPropagate(
    Reuse("tl", {tl: Reuse({tl: Reuse(up("tl"), up("tl"), up("tl"), {tl: Reuse("tl", "tl", "tl")})})}),
    Reuse({tl: Reuse({tl: New({hd: "Inserted", tl: Reuse()})})})
  ));
finishTests(true);
*/
testBackPropagate(
  ReuseArray(3, New({0: Reuse(1), 1: Reuse(2), 2: Reuse(0)}, []), Reuse()),
  ReuseArray(2, Reuse(), 0, New(["Inserted"]), Reuse()),
  ReuseArray(0, New(["Inserted"]), Reuse()),
  "Insert in array after reordering");

/*
shouldBeEqual(
  diff(
    [["section", [["class", "sec"]], [["TEXT", "abc"]]], ["section", [["class", "sec"]], [["TEXT", "def"]]]],
    [["script", [], []], ["section", [["class", "sec"], ["id", "test"]], [["TEXT", "abc"]]], ["section", [["class", "sec"]], [["TEXT", "def"]]]], defaultDiffOptions
  ),
  ReuseArray(0, New.nested(["script", [], []]),
                Reuse({0: Reuse({1: ReuseArray(1, Reuse(), 0, New.nested([["id", "test"]]))})}))
);
finishTests(true);

shouldBeEqual(
  diff(
    [["div", [["class", "g-static"]], [["TEXT", "Hello"]]]],
    [["script", [], [["TEXT", "var"]]], ["div", [["class", "g-static"]], [["TEXT", "Hello"], ["br", [], []]]]],
    defaultDiffOptions
  ),
  ReuseArray(0, New.nested([["script", [], [["TEXT", "var"]]]]),
                Reuse({0: Reuse({1: Reuse({0: Reuse({1: ReuseArray(8, Reuse(), New(" activated"))})}),
                                 2: ReuseArray(1, Reuse(), New.nested(["br", [], []]))})}))
);
process.exit(0);

shouldBeEqual(
diff(
  [["head", [], [["TEXT", "\n"]]], ["body", [], []]],
  [["head", [], [["TEXT", "\n"],["script", [], []]]], ["TEXT", "\n"], ["body", [], [["script", [], []]]]],
  defaultDiffOptions
),
ReuseArray(1, Reuse({0: Reuse({2: ReuseArray(1, Reuse(), New.nested([["script", [], []]]))})}),
           0, New([New.nested(["TEXT", "\n"])]),
           1, Reuse({0: Reuse({2: New.nested([["script", [], []]])})}),
              New([])));*/

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

function testBackPropagate(editStep, userStep, expectedUserStep, name) {
  incompleteLines.push(currentTestLine());
  shouldBeEqual(
    backPropagate(
      editStep, userStep
    ), expectedUserStep, name + " [single]"
  );
};

testBackPropagate(
    Reuse({heap: Reuse({1: Reuse({values: ReuseArray(0, Reuse(),
                                                     1, Reuse({0: Reuse(up("0"), up, up, up, up, "stack", "hd", "value")}),
                                                        Reuse())})}),
           stack: Reuse({hd: New({ ctor: "ComputationNode",
                                   node: Reuse(up("node"), up, "heap", 1, "values", 1)}),
                         tl: Reuse({hd: Reuse({resultIsSpread: New(false),
                                               indexToEval: New(1)})})})}),
    Reuse({heap: Reuse({1: Reuse({values: ReuseArray(1, Reuse(),
                                                 0, New({ 0: New({ ctor: "Raw",
                                                                   value: 2})}, []),
                                                    Reuse())})})}),
    Reuse({heap: Reuse({1: Reuse({values: ReuseArray(1, Reuse(),
                                                     0, New({ 0: New({ ctor: "Raw",
                                                                       value: 2})}, []),
                                                        Reuse())})})})
, "heap update")

testBackPropagate(
    Reuse("heap", 1, "values", {0: Reuse("value"),
                                1: Reuse("value")}),
    ReuseArray(1, Reuse(),
               0, New({ 0: New({ ctor: "Raw",
                                 value: 2})}, []),
                  Reuse()),
    Reuse({heap: Reuse({"1": Reuse({values: 
      ReuseArray(1, Reuse(), 0, New({ 0: New({ ctor: "Raw",
                                 value: 2})}, []), Reuse())
    })})}),
    "heap update X"
    );

testBackPropagate(
    Reuse({0: Reuse("value")}),
    ReuseArray(0, New([2]), Reuse())
   ,ReuseArray(0, New([2]), Reuse()), "ReuseArray through Reuse");


// Same tests without nd.

testBackPropagate(
    ReuseArray(2, Reuse({1: Reuse(up("1"), up, 3)}), Reuse({1: Reuse(up("1"), up, 4)})),
    ReuseArray(2, Reuse({1: New(3)}), Reuse({1: New(4)}))
   ,Reuse({3: New(3), 4: New(4)}), "ReuseReuse");

testBackPropagate(
     ReuseArray(0, New([1]), Reuse()),
     ReuseArray(1, Reuse(), ReuseArray(0, New([2]), Reuse()))
   , ReuseArray(0, New([2]), Reuse()), "Insertion Step");

testBackPropagate(
     ReuseArray(1, New([]), Reuse()),
     ReuseArray(0, New([2]), Reuse())
  , ReuseArray(1, Reuse(), 0, New([2]), Reuse()), "Insertion after deletion");

testBackPropagate(
     ReuseArray(2, Reuse(), Reuse({0: Reuse(up("0"), up, 5)})),
     ReuseArray(3, Reuse({2: New(3)}), Reuse())
  , Reuse({5: New(3)}), "Split right backPropagateReuseArray");

testBackPropagate(
     ReuseArray(2, Reuse(), New([Reuse(up, 5)])),
     ReuseArray(3, Reuse({2: New(3)}), Reuse())
  , Reuse({5: New(3)}), "Split right backPropagateReuseArray");

testBackPropagate(
     ReuseArray(2, Reuse({1: Reuse(up("1"), up, 5)}), Reuse()),
     ReuseArray(1, Reuse(), Reuse({0: New(3)}))
  , Reuse({5: New(3)}), "Split left backPropagateReuseArray");

testBackPropagate(
    Reuse("a"),
    ReuseArray(2, New([4]), Reuse())
  ,Reuse({a: ReuseArray(2, New([4]), Reuse())}), "ReuseArray after reuse");

testBackPropagate(
    ReuseArray(2, New([]), Reuse()),
    Reuse({3: Reuse({1: Reuse({3: Reuse({1: New("style")})})})})
  ,ReuseArray(2, Reuse(), Reuse({3: Reuse({1: Reuse({3: Reuse({1: New("style")})})})})), "Reuse after ReuseArray");

testBackPropagate(
    ReuseArray(0, New([1, 2]), Reuse()),
    Reuse({5: Reuse({1: Reuse({3: Reuse({1: New("style")})})})})
  ,Reuse({3: Reuse({1: Reuse({3: Reuse({1: New("style")})})})}), "Reuse after ReuseArray 2");




shouldBeEqual(andThen(
     ReuseArray(2, Reuse(), 1, New([]), Reuse()),
     ReuseArray(2, Reuse(), 0, New([1]), Reuse())
 ),  Reuse(), "insertion followed by deletion");

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
]
var array1to2 = diff(array1, array2);
shouldBeEqual(apply(array1to2, array1), array2);
shouldBeEqual(
  diff(array1, array2),
  ReuseArray(2, Reuse(),
             0, New.nested([["h2", [], [["TEXT", "Hello world"]]]]), Reuse()))
  

// andThen with ReuseArray

shouldBeEqual(andThen(
  Reuse({values: Reuse({0: Reuse(up("0"), up, "toReplace")})}),
  New({values: Reuse(), toReplace: Reuse(5)})),
  New({values: Reuse({0: Reuse(up("0"), 5)}), toReplace: Reuse(5)}), "andThen_ReuseArray1");

// First cut before second cut, no overlap, only reuse
shouldBeEqual(andThen(
     ReuseArray(10, Reuse(), Reuse({1: New(3)})),
     ReuseArray(6, Reuse({1: New(2)}), Reuse())
  ), ReuseArray(6, Reuse({1: New(2)}), ReuseArray(4, Reuse(), Reuse({1: New(3)}))), "andThen_ReuseArray2");


// First cut after second cut, no overlap, only reuse
shouldBeEqual(andThen(
     ReuseArray(6, Reuse({1: New(3)}), Reuse()),
     ReuseArray(10, Reuse(), Reuse({1: New(2)}))
  ), ReuseArray(10, ReuseArray(6, Reuse({1: New(3)}), Reuse()), Reuse({1: New(2)})), "andThen_ReuseArray3");

// First cut before second cut, small overlap, only reuse
shouldBeEqual(andThen(
     ReuseArray(10, Reuse({9: New(3)}), Reuse()),
     ReuseArray(6, Reuse(), Reuse({1: New(2)}))
  ), ReuseArray(6, Reuse(), ReuseArray(4, Reuse({1: New(2), 3: New(3)}), Reuse())), "andThen_ReuseArray4");

// First cut after second cut, small overlap, only reuse
shouldBeEqual(andThen(
     ReuseArray(6, Reuse(), Reuse({1: New(2)})),
     ReuseArray(10, Reuse({9: New(3)}), Reuse())
  ), ReuseArray(10, ReuseArray(6, Reuse(), Reuse({1: New(2), 3: New(3)})), Reuse()), "andThen_ReuseArray5");

// First cut before second cut, full overlap, only reuse
shouldBeEqual(andThen(
     ReuseArray(10, Reuse({7: Reuse({b: Reuse(up("b"), "a")})}), Reuse()),
     ReuseArray(6, Reuse(), Reuse({1: New({a: New(2), b: New(3)})}))
  ), ReuseArray(6, Reuse(), ReuseArray(4, Reuse({1: New({a: New(2), b: New(2)})}), Reuse())), "andThen_ReuseArray6");

// First cut after second cut, full overlap, only reuse
shouldBeEqual(andThen(
     ReuseArray(6, Reuse(), Reuse({1: Reuse({b: Reuse(up("b"), "a")})})),
     ReuseArray(10, Reuse({7: New({a: New(2), b: New(3)})}), Reuse())
  ), ReuseArray(10, ReuseArray(6, Reuse(), Reuse({1: New({ a: 2, b: 2})})), Reuse()), "andThen_ReuseArray7");

// Reaching outside of ReuseArray after deletion
shouldBeEqual(andThen(
     Reuse({values: ReuseArray(2, Reuse(), ReuseArray(1, New([]), New([Reuse(up, up, "toReplace")])))}),
     New({values: Reuse(), toReplace: Reuse(5)})
  ), New({values: ReuseArray(2, Reuse(), ReuseArray(1, New([]), New([Reuse(up, 5)]))),
     toReplace: Reuse(5)
  }), "andThen_ReuseArray8");

shouldBeEqual(andThen(
     ReuseArray(1, New([]), Reuse()), // 2. Delete first element
     ReuseArray(1, New([]), Reuse())  // 1. Delete first element
  ), ReuseArray(1, New([]), 1, New([]), Reuse()), "andThen_ReuseArrayDelete1"); // Delete first two elements

shouldBeEqual(andThen(
     ReuseArray(1, New([]), Reuse()), // 2. Delete first element
     ReuseArray(2, Reuse(), New([]))  // 1. Delete everything but first two elements
  ), ReuseArray(2, ReuseArray(1, New([]), Reuse()), New([])), "andThen_ReuseArrayDelete2"); // Delete everything but second element.

shouldBeEqual(andThen(
     ReuseArray(5, Reuse(), ReuseArray(1, New([]), Reuse())), // 2. Keep first 5 els, delete 6th
     ReuseArray(1, New([]), Reuse())                          // 1. Delete first element
  ), ReuseArray(1, New([]), ReuseArray(5, Reuse(), ReuseArray(1, New([]), Reuse()))), "andThen_ReuseArrayDelete3");

shouldBeEqual(andThen(
     ReuseArray(5, Reuse(), ReuseArray(1, New([]), Reuse())), // 2. Keep first 5 els, delete 6th
     ReuseArray(1, Reuse({0: New(1)}), Reuse())               // 1. Replace first element
  ), ReuseArray(1, Reuse({0: New(1)}), ReuseArray(4, Reuse(), ReuseArray(1, New([]), Reuse()))), "andThen_ReuseArrayDelete4");

// If first action is a New, then result should be the computation of applying the edit action
shouldBeEqual(andThen(
     ReuseArray(3, Reuse(), ReuseArray(1, New([]), ReuseArray(0, New([11]), Reuse({1: New(4)})))),
     New([0,0,0,1, 2, 3])
  ), New([0,0,0,11, 2, 4]));

// If second action is a New, then result should be a New as well
shouldBeEqual(andThen(
     New([Reuse(3)]),
     ReuseArray(3, Reuse(), ReuseArray(1, Reuse({0: Reuse(up("0"), 1)}), Reuse()))
  ), New([Reuse(1)]));
//--------------------

shouldBeEqual(
  andThen(
    New({x: Reuse("a")}),
    Reuse({a: Reuse(up("a"), "b")})),
  New({x: Reuse("b")})
);

shouldBeEqual(
  diff([["b", [], [["TEXT", "hello"]]]], [["TEXT", "hello"]], {maxCloneDown: 3}),
  Reuse({0: ReuseArray(3, New([]),
                          New([Reuse(up, 2, 0, 0),
                               Reuse(up, 2, 0, 1)]))})
)
//process.exit(0)

shouldBeEqual(
  diff(["p", 1, 1], [1, "p"]),
  Choose(
    nd.ReuseArray(0, nd.New([nd.or(nd.Reuse(up, 1), nd.Reuse(up, 2), nd.New(1))]), 1, nd.Reuse(), nd.New([])),
    nd.ReuseArray(1, nd.New([]), 1, nd.Reuse(), nd.New([nd.or(nd.Reuse(up, 0), nd.New("p"))])),
    nd.ReuseArray(2, nd.New([]), 1, nd.Reuse(), nd.New([nd.or(nd.Reuse(up, 0), nd.New("p"))])),
    nd.New([nd.Reuse(1).concat(nd.Reuse(2)), nd.Reuse(0)])
  )
);
shouldBeEqual(
  nd.diff(["p", 1, 1], [1, "p"], {onlyReuse: true}),
  nd.or(
    nd.ReuseArray(0, nd.New([nd.or(nd.Reuse(up, 1), nd.Reuse(up, 2))]), 1, nd.Reuse(), nd.New([])),
    nd.ReuseArray(1, nd.New([]), 1, nd.Reuse(), nd.New([nd.Reuse(up, 0)])),
    nd.ReuseArray(2, nd.New([]), 1, nd.Reuse(), nd.New([nd.Reuse(up, 0)]))
  )
);

shouldBeEqual(
  nd.diff(["link", "meta"], ["script", "script", "link", "meta"], {maxDepth: 0, onlyReuse: true}),
  nd.ReuseArray(0, nd.New(["script", "script"]), nd.Reuse())
);

shouldBeEqual(
  andThen(Reuse({a: Reuse(up("a"), "b")}), Reuse({b: Reuse(up("b"), "c"), a: New(1) })),
  Reuse({a: Reuse(up("a"), "c"), b: Reuse(up("b"), "c")}));

shouldBeEqual(
  path({hd: "x", tl: {hd: "y", tl: undefined}}), path("x", "y")
);

/*
shouldBeEqual(
  backPropagate(
    ReuseArray(1, Reuse(),
               1, Reuse({0: Reuse(up("0"), up, up, up, up, "stack", "hd", "value")}),
               Reuse())
  )

);*/
shouldBeEqual(
  backPropagate(
    ReuseArray("heap",
           1, Reuse({0: Reuse("value")}),
           1, Reuse({0: Reuse("value")}),
           Reuse()),
    ReuseArray(1, Reuse(),
               0, New({ 0: 2}, []),
             Reuse())
  ),
  Reuse({
    heap: ReuseArray(
      1, Reuse(),
      ReuseArray(0, New([New(2)]), Reuse()),
    )})
);

shouldBeEqual(
  apply(ReuseArray(5, Reuse(), New("big")), "Hello"),
  "Hellobig"
);

shouldBeEqual(
  nd.concatMap(nd.Reuse({value: nd.New(1)}).concat(nd.New({b: 2})), ea => {
    if(ea.ctor == Type.Reuse) {
      return nd.concatMap(ea.childEditActions.value, value => {
        if(value.ctor == Type.New) {
          return nd.Reuse({value: nd.New(value.model).concat(nd.New(value.model+1)) });
        }
      });
    } else {
      return nd.New({c: nd.New(3)});
    }
  }),
  nd.Reuse({value: nd.New(1).concat(nd.New(2))}).concat(nd.New({c: nd.New(3)}))
);

shouldBeEqual(
  nd.first(nd.New([])), New([])
)
shouldBeEqual(
  nd.first(
    nd.Reuse("abc", {
      value: nd.ReuseArray(1, nd.New([]).concat(nd.New([1])), nd.Reuse()),
    }).concat(nd.New(1))
  ),
  Reuse("abc", {value: ReuseArray(1, New([]), Reuse())})
)

shouldBeEqual(
  nd.ensure(New([])), nd.New([])
);
shouldBeEqual(
  nd.ensure(Reuse("abc", {value: ReuseArray(1, New([]), Reuse())})),
    nd.Reuse("abc", {
      value: nd.ReuseArray(1, nd.New([]), nd.Reuse()),
    })
  );

shouldBeEqual(
  andThen(Reuse("f", {a: Reuse(up("a"), "b")}), Reuse("g", {f: New({a: New(1), b: New(2)})})),
  New({a: New(2), b: New(2)}));

addLens = {
  apply: function add([{value: left}, {value: right}]) { return {value: left + right}; },
  update: function (editAction, [{value: left}, {value: right}], {value: oldValue}) {
        if(editAction.ctor === "Reuse" && editAction.childEditActions.value && editAction.childEditActions.value.ctor == "New") {
          let newValue = editAction.childEditActions.value.model;
          return Reuse({0: Reuse({value: New(left + newValue - oldValue)})});
        }
        console.log(editAction);
        throw "Edit action not supported in + lens";
      }
}
step = 
  Reuse({stack: Reuse({hd: New({ ctor: "Result",
                               value: Custom(Reuse("argsEvaled"), addLens)})})});

// Need to execute the lens once in forward first so that it can cache the results.
shouldBeEqual(apply(step, { stack: {hd: {argsEvaled: [{value: 1}, {value: 2}]}}}), { stack: {hd: {ctor: "Result", value: {value: 3}}}});

testBackPropagate(step,
  Reuse({stack: Reuse({hd: Reuse({value: Reuse({value: New(4)})})})}),
  Reuse({stack: Reuse({hd: Reuse({argsEvaled: Reuse({ 0: Reuse({ value: New(2)})})})})}));

shouldBeEqual(
  andThen(Reuse({a: Reuse({c: New(1)}), b: Reuse(up("b"), "a")}), New({a: Reuse()})),
  New({a: Reuse({c: New(1)}), b: Reuse()})
)

var thisObj = { ctor: "Ref", heapIndex: 8}

shouldBeEqual(apply(
  Reuse({
    env: Reuse(up("env"), "heap", 5, "env"),
    stack: New({ hd: New({ ctor: "AssignmentMultiple",
                           params: New([]),
                           args: ReuseArray("hd", "argsEvaled",
                                            0, New({ 0: New(thisObj)}, []),
                                            0, Reuse())}),
                 tl: New({ hd: New({ ctor: "ComputationNode",
                                     node: Reuse(up("node"), "heap", 5, "funDecl", "body")}),
                           tl: New({ hd: New({ ctor: "EndOfFunction",
                                               env: Reuse(up("env"), "env")}),
                                     tl: Reuse("tl")})})})}),
  {env: "deleted",
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
         hd: {ctor: "EndOfFunction", env: "deleted"},
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
      hd: Reuse(up("hd"), "tl", "hd", { // Convert to self-sufficient computation
    objectRef: Reuse(up("objectRef"), up, up, "hd", "value")}),
      tl: Reuse("tl")})}),
    {stack: {hd: {value: 2}, tl: {hd: {objectRef: 1, n: 3}, tl: undefined}}}),
  {stack: {hd: {objectRef: 2, n: 3}, tl: undefined}});

//pathname
shouldBeEqual(path(path("body", 0), path("expression")), path("body", 0, "expression"))

//Composition

shouldBeEqual(andThen(Reuse(), Reuse()), Reuse());
shouldBeEqual(andThen(Reuse(), New(1)), New(1));
shouldBeEqual(andThen(New(1), Reuse()), New(1));
shouldBeEqual(andThen(New(1), New(2)), New(1));
shouldBeEqual(andThen(Reuse({a: Reuse("..", "b")}), New({a: New(1), b: New(2)})),
            New({a: New(2), b: New(2)}));
            
shouldBeEqual(andThen(Reuse("a"), Reuse()), Reuse("a"))
shouldBeEqual(andThen(Reuse(), Reuse("a")), Reuse("a"))

s0 = New({ stack: New({ hd: New({ ctor: "ComputationNode",
                                  node: Reuse()}),
                        tl: undefined})}, {env:1, heap: 1});
s1 = Reuse({stack: Reuse({hd: New({ ctor: "Statements",
                               statements: New({ hd: Reuse("node", "body", 0),
                                                 tl: undefined})})})})
s2 = Reuse({stack: Reuse({hd: New({ ctor: "ComputationNode",
                               node: Reuse("statements", "hd")}),
                     tl: Reuse(up("tl"), "hd", {statements: Reuse("tl")})})});
s3 = Reuse({stack: Reuse({hd: Reuse({node: Reuse("expression")})})});
s10 = New({ stack: New({ hd: New({ ctor: "Statements",
                             statements: New({ hd: Reuse("body", 0),
                                               tl: undefined})}),
                         tl: undefined})}, {env:1, heap: 1});
//shouldBeEqual(andThen(s1, s0), s10);
s20 = New({ stack: New({ hd: New({ ctor: "ComputationNode", node: Reuse("body", 0)}),
  tl: New({ ctor: "Statements",
                             statements: New(undefined)})
})}, {env: 1, heap: 1});
//shouldBeEqual(andThen(s2, s10), s20);
s30 = New({ stack: New({ hd: New({ ctor: "ComputationNode",
                             node: Reuse("body", 0, "expression")}),
                   tl: New({ ctor: "Statements",
                             statements: undefined})})}, {env:1, heap: 1})
shouldBeEqual(andThen(s3, s20), s30);

// Back-propagation

shouldBeEqual(nd.backPropagate(
   Reuse("b"),
    nd.New(3)),
  nd.Reuse({b: nd.New(3)}), "Clone new");

shouldBeEqual(nd.backPropagate(
   Reuse({d: Reuse(up("d"), "c")}, "b"),
    nd.Reuse({d: nd.New(3)})),
  nd.Reuse({b: nd.Reuse({c: nd.New(3)})}));

shouldBeEqual(nd.backPropagate(
   Reuse({d: Reuse(up("d"), "c"), e: Reuse(up("e"), "c")}),
    nd.Reuse({d: nd.New(3), e: nd.New(5)})),
  nd.Reuse({c: nd.New(3).concat(nd.New(5))}));

shouldBeEqual(backPropagate(
   Reuse({a: Reuse(up("a"), "b")}),
    Reuse("a")),
  Reuse("b"));

shouldBeEqual(nd.backPropagate(
   Reuse({a: Reuse(up("a"), "b")}),
    nd.Reuse("a")),
  nd.Reuse("b"));

shouldBeEqual(backPropagate(
   New({a: Reuse("b"), b: Reuse("b")}),
    Reuse("a")),
  Reuse("b"));

shouldBeEqual(nd.backPropagate(
   New({a: Reuse("b"), b: Reuse("b")}),
    nd.Reuse("a")),
  nd.Reuse("b"));

shouldBeEqual(nd.backPropagate(
   Reuse({a: Reuse(up("a"), "b")}),
    nd.Reuse("b")),
  nd.Reuse("b"));

shouldBeEqual(nd.backPropagate(
   Reuse({a: Reuse(up("a"), "b"), b: Reuse(up("b"), "a")}),
    nd.Reuse("b")),
  nd.Reuse("a"));

shouldBeEqual(nd.backPropagate(
   Reuse({a: Reuse(up("a"), "b")}),
    nd.Reuse({a: nd.New(3)})),
  nd.Reuse({b: nd.New(3)}));

shouldBeEqual(nd.backPropagate(
   New({d: Reuse("a"), c: Reuse("a"), b: Reuse("b")}),
    nd.Reuse({d: nd.New(3), c: nd.New(5)})),
  nd.Reuse({a: nd.New(3).concat(nd.New(5))}));

shouldBeEqual(nd.backPropagate(
   New({a: Identity, b: Identity}),
    nd.Reuse({a: nd.New(2)})),
  nd.New(2));

shouldBeEqual(nd.backPropagate(
   Reuse("a", {
     b: Reuse(up("b"), up, "c")
   }),
    nd.Reuse({
      b: nd.New(3)
    })),
  nd.Reuse({
    c: nd.New(3)
  }));

shouldBeEqual(nd.backPropagate(
   Reuse("app", "body", {
      body: Reuse({
        app: Reuse({
          arg: Reuse(up("arg"), up, up, up, up, "arg")
        }),
        arg: Reuse(up("arg"), up, up, up, "arg")
      })
      }),
    nd.Reuse({body: nd.Reuse({app: nd.Reuse("app")}).concat(nd.Reuse("app"))})),
  nd.Reuse({
    app: nd.Reuse({
      body: nd.Reuse({
         body: nd.Reuse({app: nd.Reuse("app")})
       })
      })
    }).concat(
  nd.Reuse({
    app: nd.Reuse({
      body: nd.Reuse({
         body: nd.Reuse("app")
       })
      })
    })
  )
  );

shouldBeEqual(backPropagate(
  New({a: New({b: Reuse("c", {d: Reuse(up("d"), up, "f")}) })}),
  Reuse({a: Reuse({b: Reuse({d: Reuse(up("d"), "e", {p: Reuse(up("p"), up, "d")}), e: Reuse(up("e"), "d")})})})),
  Reuse(
    {f: Reuse(up("f"), "c", "e", {p: Reuse(up("p"), up, up, "f")}),
     c: Reuse({e: Reuse(up("e"), up, "f")})
    }));

shouldBeEqual(backPropagate(
  Reuse({a: New({k: Reuse(up("k"), "b", "c"), p: Reuse(up("p"), "b", "d")}), b: Reuse(up("b"), "a", "m")}),
  Reuse({b: New({u: Identity, o: Reuse(up("o"), "a", "k"), t: Reuse(up("t"), "a", "p")})})),
 Reuse({a: Reuse({m: New({u: Identity, o: Reuse(up("o"), up, "b", "c"), t: Reuse(up("t"), up, "b", "d")})})}));

shouldBeEqual(nd.backPropagate(
  New({a: New({b: Reuse("c", {d: Reuse(up("d"), up, "f")}) })}),
  nd.Reuse({a: nd.Reuse({b: nd.Reuse({d: nd.Reuse(up("d"), "e", {p: nd.Reuse(up("p"), up, "d")}), e: nd.Reuse(up("e"), "d")})})})),
  nd.Reuse(
    {f: nd.Reuse(up("f"), "c", "e", {p: nd.Reuse(up("p"), up, up, "f")}),
     c: nd.Reuse({e: nd.Reuse(up("e"), up, "f")})
    }));

shouldBeEqual(nd.backPropagate(
  Reuse({a: New({k: Reuse(up("k"), "b", "c"), p: Reuse(up("p"), "b", "d")}), b: Reuse(up("b"), "a", "m")}),
  nd.Reuse({b: nd.New({u: nd.Identity, o: nd.Reuse(up("o"), "a", "k"), t: nd.Reuse(up("t"), "a", "p")})})),
 nd.Reuse({a: nd.Reuse({m: nd.New({u: nd.Identity, o: nd.Reuse(up("o"), up, "b", "c"), t: nd.Reuse(up("t"), up, "b", "d")})})}));

shouldBeEqual(nd.backPropagate(
  Reuse(["app", "body"], {arg: Reuse(up("arg"), up, up, "arg")}),
  nd.Reuse({arg: nd.Reuse(up("arg"), "app")})),
  nd.Reuse({arg: nd.Reuse(up("arg"), "app", "body", "app")})
)

shouldBeEqual(nd.backPropagate(
  Reuse(["app", "body"], {arg: Reuse(up("arg"), up, up, "arg")}),
  nd.New({app: nd.Reuse("app"), arg: nd.Reuse("app")})),
  nd.Reuse({app: nd.Reuse({body: nd.New({app: nd.Reuse("app"), arg: nd.Reuse("app")})})})
)

shouldBeEqual(nd.backPropagate(
    New({b: Reuse("a"), c: Reuse("a")}),
    nd.Reuse({b: nd.New(2), c: nd.New({d: nd.Identity})})),
    nd.Reuse({a: nd.New({d: nd.New(2)})})
  )

// ReuseArray

var prog = ["To move elsewhere", "Keep", "Keep with next", "Keep and to clone"];

var step = ReuseArray(
    1, New([]),                            // Deletes 0
    1, Reuse(),                            // Keeps 1
    0, New({0: Reuse(up, 3)},[]),              // Clones the field 3 before 2
    2, Reuse(), // Keeps 2 and 3
    0, New({0: Reuse(up, 0)}, []),         // Move the field "0" there
    0, New({0: New("Inserted at end")}, []) // Inserts a new value
  );

shouldBeEqual(apply(step, prog),
  ["Keep", "Keep and to clone", "Keep with next", "Keep and to clone", "To move elsewhere", "Inserted at end"]);

shouldBeEqual(apply(
  Reuse({heap: ReuseArray(
  1, Reuse(), 1, Reuse({0: Reuse(up("0"), up, up, "stack", "hd", "value")}), 1, Reuse())}),
    {heap: [40, 50, 60], stack: {hd: {value: 1}}}),
  {heap: [40, 1, 60], stack: {hd: {value: 1}}})

step = ReuseArray(
      5, Reuse(),                       // "Hello"
      6,                                // " world"
        ReuseArray(
          0, New(" big world, nice"),   // insertion
          6, Reuse()                    // " world"
        ),
      2, Reuse(), // The string "! "
      0, New("?"), // The inserted string "?"
      1, Reuse()
    )
    
shouldBeEqual(apply(step, "Hello world! ?"), "Hello big world, nice world! ??")

step = nd.ReuseArray(
      5, nd.Reuse(),                       // "Hello"
      6,                                // " world"
        nd.ReuseArray( // Considering substring " world"
          0, nd.New(" big world, nice"),   // insertion
          nd.Reuse()                    // " world"
        ).concat(
        nd.ReuseArray(
          1, nd.Reuse(), // " "
          0, nd.New("big world. nice "),   // insertion
          nd.Reuse()                    // "world"
        )),
      2, nd.Reuse(), // The string "! "
      0, nd.New("?"), // The inserted string "?"
      nd.Reuse()
    )

shouldBeEqual(nd.apply(step, "Hello world! ?"), "Hello big world, nice world! ??", "ReuseArray1");
shouldBeEqual(nd.apply(step, "Hello world! ?", true), "Hello big world. nice world! ??", "ReuseArray2");
shouldBeEqual(nd.applyAll(step, "Hello world! ?"), ["Hello big world, nice world! ??", "Hello big world. nice world! ??"], "ReuseArray3");

// Should not fail
apply(ReuseArray(1, Reuse(), 0, New({0: undefined, 1: undefined}, [])), [0])

///// Complex interactions between ReuseArray, New and Reuse

pStep = Reuse({heap: ReuseArray(
       1, Reuse(),
       1, Reuse({0: Reuse(up("0"), up, up, "stack", "hd")}),
       0, Reuse())});
uStep = Reuse({heap: Reuse({1: Reuse({value: New(22)})})});

testBackPropagate(
  pStep, uStep,
  Reuse({stack: Reuse({hd: Reuse({value: New(22)})})}), "pStep_uStep1");

pStep = Reuse({heap: ReuseArray(
       1, New([]),
       3, ReuseArray(
           1, New([2, 3, 4]),
           2, Reuse()
         ),
       1, Reuse())});
uStep = Reuse({heap: Reuse({5: Reuse({value: New(22)})})});

testBackPropagate(
  pStep, uStep,
  Reuse({heap: ReuseArray(4, Reuse(), 1, Reuse({0: Reuse({value: New(22)})}), Reuse())}), "pStep_uStep2");

pStep = Reuse({heap: ReuseArray(
       1, New([]),
       3, New([Reuse(up, 2)]))});
uStep = Reuse({heap: Reuse({0: Reuse({value: New(22)})})});

testBackPropagate(
  pStep, uStep,
  Reuse({heap: Reuse({2: Reuse({value: New(22)})})}), "pStep_uStep3");

pStep = Reuse({heap: ReuseArray(
       1, New([5, 6]),
       3, New([Reuse(2)]))});
uStep = Reuse({heap: Reuse({2: Reuse({value: New(22)})})});

testBackPropagate(
  pStep, uStep,
  Reuse({heap: ReuseArray(1, Reuse(), 3, Reuse({2: Reuse({value: New(22)})}), Reuse())}), "pStep_uStep4");

// Custom
var plusEditAction =
  Custom(Reuse("args"),
           ({left, right}) => left + right,
           function(outputDiff, {left, right}, outputOld) {
             if(outputDiff.ctor === Type.New) {
               let diff = outputDiff.model - outputOld;
               return nd.Reuse({left: nd.New(left + diff)}).concat(nd.Reuse({right: nd.New(right + diff)}));
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
  nd.backPropagate(plusEditAction, nd.New(5)),
  nd.Reuse({args: nd.Reuse({left: nd.New(2)})}).concat(
    nd.Reuse({args: nd.Reuse({right: nd.New(4)})})
  )
)

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
    console.log((name ? name + " (line "+line+"): " : "Line " + line + ":") + "Expected\n" + s2 + "\n, got \n" + s1);
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