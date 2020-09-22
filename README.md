# edit-actions

*edit-actions* is a JavaScript implementation of Edit Actions.  
Edit actions are a powerful minimalistic language to model tree-to-tree transformations, including
* Tree insertion and tree deletion
* Tree wrapping and tree unwrapping
* Tree move or clones

Edit actions also extend to [monoids](https://en.wikipedia.org/wiki/Monoid) like strings and array to provide combinators that can encode notions of
* slices or substrings
* concatenations
* insertions of new or cloned elements
* deletions.

Edit actions can be
- applied to record, strings and arrays
- composed in an associative way
- merged using hints
- back-propagated.

# Sandbox online

The [sandbox](https://mikaelmayer.github.io/bam/sandbox.html) is a nice place to experiment with Edit Actions. Click on the buttons to apply edit actions to objects, and to back-propagate edit actions from edit actions.

To illustrate the example explained in details below:
* Put `{a: 1}` in the top left box
* Put `Down("a", New({b: Reuse(), c: Reuse()}))` in the top middle box
* Press the button `bam.apply(evaluation step, program)`.
* Now in the bottom right box, replace the program with `{b: 2, c: {d: 1}}`
  The middle right box is filled automatically
* Press the button `user step' = backPropagate(evaluation step, user step)`
  The middle left and middle bottom boxes are filled automatically.

# Quick node.js install

Remove the -g parameter to install it for a single node project:

    npm install -g edit-actions
    
In your project use it like:

    var editActions = require("edit-actions");

# Learn Edit Actions from Examples

Edit Actions handles ***trees*** whatever they might represent.

Here are the most basic two examples. The `New()` operator creates something from scratch, and the `Reuse()` operator reuses the previous tree:
```
apply(New("x"), {a: {}, b: "cd"}) == "x"

apply(Reuse(),  {a: {}, b: "cd"}) == {a: {}, b: "cd"}
```

We can nest these operations to get more advanced transformations: `Reuse` can take an argument which is an object whose fields indicate which fields should be changed and how:

```
apply(New({x: New("y")}), {a: {}, b: "cd"}) == { x: "y" }

apply(New({x: Reuse()}),  {a: {}, b: "cd"}) == { x: {a: {}, b: "cd"} }

apply(Reuse({a: New(x)}), {a: {}, b: "cd"}) == {a: "x", b: "cd"}
```

We can also reuse elements down the tree by providing the Edit action "Down". Note that the second argument of `Down` can be omitted if it is `Reuse()`, and several nested `Down` can be written in just one argument call

```
apply({Down("a", Reuse()), {a: {b: 2}})      == {b: 2}

apply({Down("a", Down("b", Reuse())), {a: {b: 2}}) == 2

apply({Down("stack", "hd", Reuse({x: "y"})), {stack: {hd: {ctor: "hello"}}}) == {ctor: "hello", x: "y"}
```

We can also reuse elements up the tree by using the edit action `Up`. Similar to `Down`, the second argument can be omitted if it is `Reuse`, and several nested `Up` can be flattened into a single call.

```
apply({Reuse({a: Up("a", Down("b")))}), {a: {}, b: "cd"}) = {a: "cd", b: "cd"}

apply({Reuse({stack: Up("stack", Down("state", "hd"))}), {stack: 1, state: { hd: 2} }) = {stack: 2, state: { hd: 2 } }
```

We can handle string and arrays similarly, using `Interval`s instead of fields, and various operations:

```
apply(Down(Interval(1, 4)), "ABCDefghij") = "BCD"
apply(Down(Interval(5)), "ABCDefghij") = "fghij"
apply(Concat(3, Down(Interval(1, 4)), Down(Interval(5))), "ABCDefghij") = "BCDfghij"

apply(Keep(2, Remove(3, Prepend(1, [Up(Interval(5), Down(0))], RemoveAll()))),              // Just keep the rest of the array
  ["a", "b", "c", "d", "e", "f", "g", "x", "z"]) =
//  |\___|___        ______/ ____/
//  |    |   \      /       /
  ["a", "b", "a", "f",   "g"]
```

# Language Library

## Edit Actions

An "edit action" transforms a record, a scalar, a string or an array into a mix of records, scalars, strings or arrays:

A core edit action `EA` works on records and scalars, and consists of either:
- `New({a = EA, b = EA})` or `New(3)`:  Create a new record or scalar. If record, fields are also edit actions
- `Reuse({a = EA, b = EA})`: Reuse a record, modifying a subset of its fields by other edit actions
- `Up("a", EA)` / `Down("a", EA)`: Navigate the original record up/down a field to recover another record and performing another edit action on it. First argument is a field, second is an edit action.

*** Array and string extension ***: Arrays and strings can be extracted and rebuilt using the following primitive operations.
- `Down(Offset(count, newLength, oldLength), EA)`: Takes the substring or slice `[count, count + newLength-1]` of the given array or string, and then apply `EA` to it. `oldLength` can be `undefined`, and if so, `newLength` can be `undefined` as well, meaning we just skip `count` characters or elements.
- `Up(Offset(count, newLength, oldLength), EA)`: Assuming we are observing a slice [count', count'+newLength'-1], look at the context to take the slice [count'-count, count'-count + oldLength - 1] for the given array or string, and then apply `EA`.

Note that there are lots of syntactic sugar to use the array operations (Prepend, Append, Remove, Remove, RemoveAll...), and you should use this syntactic sugar whenever possible. See section syntactic sugar below.

In this section, all functions are accessible under `editActions.*`, for example `New` means `editActions.New`.

## `New`

For primitives, `New()` takes one arguments:

    apply(New(1), 42) == 1
    apply(New(true), 42) == true
    apply(New("abc"), 42) == "abc"

For records, `New()` takes a record whose values are edit actions:

    apply(New({a: New(1)}), 42) == {a: 1}
    apply(New({b: New(1), c: New(3)}), 42) == {b: 1, c: 3}

`New()` can also take an extra argument which is the skeleton it should build the value from.

    apply(New({1: New(2)}, {}), 42) == {1: 2}
    apply(New({1: New(2)}, []), 42) == [undefined, 2]
    apply(New({1: New(2)}, new Map()), 42) == new Map([[1, 2]]);

A reason to provide a non-empty Map as a skeleton is that it keeps the key ordering.
Now that we know how to create new values from scratch using edit actions, we'll see in the next section how we can reuse values.

## `Reuse`

To reuse a value, we write `Reuse()` with one argument, which is a record of edit actions that should apply on the modified fields, possibly extending them.

    apply( Reuse({c: New(4)}), {a: 1, b: 2, c: 42} ) == {a: 1, b: 2, c: 4}
    apply( Reuse({1: New(54)}), [40,30,90] ) == [40,54,90]
    apply( Reuse({key: New(true)}), new Map([["key", false]])) == new Map([["key", true]])

`Reuse()` can be used to create new keys as well, including new numeric keys. However, one might consider the operators `Keep, Append, Prepend, Remove` below more suited for array and strings operations.

## `Down` and `Up`

`Down()` and `Up()` explicitely traverse the input record down to the leaves, or up to the root.

    apply( Down("b"), {a: 1, b: 2, c: 42} )                      == 2
    apply( Down("b", "c", "d"), {a: 1, b: {c: {d: 42}}} )        == 42
    apply( Reuse({c: Up("c", Down("b"))}), {a: 1, b: 2, c: 42} ) == {a: 1, b: 2, c: 2}

One can put another edit action, e.g. `Reuse()`, as the last argument of a `Down` or `Up` to obtain clone-and-modify behaviors:

    apply( Reuse({c: Up("c", Down("b", Reuse({ x: New(2) })))}), {b: {x: 1, y: 3}, c: 42} ) == {b: {x: 1, y: 3}, c: {x: 2, y: 3}}

## Concat

`Concat(n, EA1, EA2)` concatenates (as string or arrays) the results of applying `EA1` and `EA2` successively, and assumes that the length of the result of applying `EA1` is `n` (needed for composition purposes).

For example, imagine that there are two edit elements `E1` and `E2` such that

    apply(E1, [1, 2, 3, 4]) = [4, 1]
    apply(E2, [1, 2, 3, 4]) = [2, 3]

then

    apply(Concat(2, E1, E2), [1, 2, 3, 4]) = [4, 1, 2, 3]

E1 could be equal to:

    E1 = Concat(1, Down(Offset(3)), Down(Offset(0, 1)))

E2 could be equal to:

    E2 = Down(Offset(1, 2));

Since `Offset(...)` is just a path element, further modifications can be done, e.g.

    apply(Down(Offset(1, 2), Reuse({ 1: Reuse({0: Up(0, 1, Offset(1, 2), Down(0))})}),
      [0, 1, [2, 3]]) = [1, [2, 0]]

## Choose

It can be handy to provide several variants that produce edit actions. The construct `Choose` can handle that: `Choose(EA1, EA2...)`

## Syntactic sugars and variants

We offer the following syntactic sugars and variants.
By `~=`, we mean they have the same semantics when applied, but they are merged and back-propagated differently.

* `"march"` ~= `New("march")` and `16` ~= `New(16)`. Yes, scalars are edit actions by themselves, that produce themselves, you can use them if you have New. It also works for arrays and objects, where keys might also be edit actions or scalars.
* `Interval(start[, endExcluded])` = `Offset(start, endExcluded-start, undefined)` is arguably a nicer way to present offsets. However, Offsets have the power to represent the assumption of the old length, which Interval do not.
* `Replace(n, m, EA1[, EA2])` ~= `Concat(m, Down(Interval(0, n), EA1), Down(Interval(n), EA2 | Reuse()))` to perform an edit actions `EA1` on the first n elements. If provided, `EA2` performs an edit on the remaining elements. Whereas the `Replace` actually forks the back-propagation mechanism into two back-propagation problems, Concat alone starts creating an expression to back-propagate at the current location.
* `Keep(n, EA2)` = `Replace(n, n, Reuse(), EA2)` to just keep the first `n` elements of the string or array as such, and to perform `EA2` on the remaining
* `RemoveExcept(offset, EA2)` ~= `Down(offset, EA2)` except that `Down` says "just replace the array there by the elements at this offset after applying EA2 to it", whereas `RemoveExcept` says "Remove everything that is not in the offset, and apply EA2 to the remaining".
* `Remove(n, EA2)` = `RemoveExcept(Offset(n), EA2)` to delete the first `n` elements of the string or array as such, and to perform `EA2` on the remaining. `EA2` can be omitted.
* `RemoveAll(EA2[, n])` = `RemoveExcept(Offset(0, 0[, n]), EA2)` to delete all elements of the array, possibly providing the length `n` of the string or array, and to perform `EA2` on the remaining, typically an insertion. `EA2` can be omitted.
* `Prepend(n, I, EA2)` ~= `Concat(n, I, EA2)` inserts the result of applying I before the array, and applies `EA2` on the array itself.
* `Append(n, EA1, I)` ~= `Concat(n, EA1, I)` inserts the result of applying I before the array, and applies `EA2` on the array itself. If I is New(scalar), the New can be omitted.
* `Insert(d, {...d: EA...})` ~= `New({...d: EA...})` except that we explicitely say that the current record is wrapped in EA.
* `InsertAll({...d: EA...})` ~= `New({...d: EA...})` except that we explicitely say that every key in the record depends on the current record.


**Full example**

Here is an illustrative example, featuring deleting, keeping, cloning, inserting, and moving:

```
var prog = ["A", "B", "C", "D"];
n();
var step = 
    Remove(1,                                // Remove "A"
    Keep(1,                                  // Use "B"
    Remove(1,                                // Remove "C"
    Keep(1,                                  // Use "D". The remaining of array is empty
    Prepend(2, Up(Offset(3, undefined, 2)),   // Inserts ["B", "C"]
    Prepend(1, New([Up(Offset(4), Down(0))]), // Inserts ["A"]
    Prepend(1, New(["G"])) // Inserts ["G"]
    ))))));
// Displays
// ["B", "D", "B", "C", "A", "G"]```

### Special case: Strings

Strings can be treated either as primitives (for a full replacement regardless of how the string was edited), or using the operators `Down(Interval(...), ...), Concat, Replace, Prepend, Append, Keep, Remove` described before.  
For example, to transform:

    "Hello world! ?"
    
to

    "Hello big world, nice world! ??"

one could use the following edit action, among others:

    Keep(
      5, // "Hello"
      Replace(6, 21,
        Prepend(
          15, "big world, nice", // insertion, New is implicit
          Reuse()                // " world"
       ),
       Keep(2,                   // The string "! "
       Prepend(1, "?"            // The inserted string "?"
    ))))

## Custom lenses

`edit-actions` supports user-defined bidirectional transformations a.k.a. lenses. Here is an example on how to define a reversible addition that backs-propagates the diff either to the left or to the right:

    > var minEditAction =
        Custom(Down("args"),
             ({left, right}) => left < right ? left: right,
             (outEdit, {left, right}, oldMin) => 
               Reuse({left: left == oldMin ? outEdit: Reuse(),
                      right: right == oldMin ? outEdit: Reuse()}))

    > apply(minEditAction, {type: "min", args: {left: 1, right: 3}});
    1

    > var x = backPropagate(minEditAction, New(2));
    Reuse({args: Reuse({left: New(2)})})
    
    > apply(x, {type: "min", args: {left: 1, right: 3}})
    {type: "min", args: {left: 2, right: 3}}

## Compute edit actions automatically

editActions has some support to compute deterministic and non-deterministic edit actions from two values. Here is how it works:

    > diff(1, 2)
    New(2)
    > diff(1, 1)
    Reuse()
    > diff(1, [1, 2])
    New({ 0: Reuse(), 1: 2}, [])
    > diff([1, 2], 1)
    Reuse(0)

It is also possible to ask for all edit actions it can find:

    > diff(1, 2)
    [New(2)]
    > diff(1, 1)
    [Reuse()]
    > diff([2, 1], [1, 2])
    [Reuse({0: [Reuse(up, 1),
                New(1)],
            1: [Reuse(up, 0),
                New(2)]}),
     ReuseArray(0, [New({ 0: [Reuse(up, 1),
                              New(1)]}, [])],
                   [ReuseArray(1, [Reuse()],
                                  [New([])])]),
     ReuseArray(1, [New([])],
                   [ReuseArray(1, [Reuse()],
                                  [New({ 0: [Reuse(up, 0),
                                             New(2)]}, [])])]),
     New({ 0: [Reuse(1)],
           1: [Reuse(0)]}, [])]

It's possible to add options as the third parameter.  
The option `onlyReuse` (default: false) prunes out all New solutions if there are solutions that use Reuse:

    > diff([2, 1], [1, 2], {onlyReuse: true})
    [Reuse({0: [Reuse(up, 1)],
            1: [Reuse(up, 0)]}),
     ReuseArray(0, [New({ 0: [Reuse(up, 1)]}, [])],
                   [ReuseArray(1, [Reuse()],
                                  [New([])])]),
     ReuseArray(1, [New([])],
                   [ReuseArray(1, [Reuse()],
                                  [New({ 0: [Reuse(up, 0)]}, [])])])]

The option `maxCloneUp` (default: 2) specifies the number of maximum depth traversal when going up, when looking for clones.

    > diff([1, [[2]]], [1, [[1]]], {maxCloneUp: 2})
    Reuse({1: Reuse({0: Reuse({0: New(1)})})})
    > diff([1, [[2]]], [1, [[1]]], {maxCloneUp: 3})
    Reuse({1: Reuse({0: Reuse({0: Reuse(up, up, up, 0)})})})

The option `maxCloneDown` (default: 2) specifies the number of maximum depth traversal when going down (even after going up), when looking for clones.

    > diff([1], 1, {maxCloneDown: 1})
    Reuse("0")
    > diff([1], 1, {maxCloneDown: 0})
    New(1)

## Aligning elements when diffing.

When diffing arrays of elements, the options

    {isCompatibleForReuseObject: (oldValue, newValue) => Boolean,
     isCompatibleForReuseArray: (oldValue, newValue) => Boolean,
    }
    
respectively indicates to `diff` if it can try an alignment using `Reuse` (if it shares the same keys) and `ReuseArray` for arrays. By default, this option is enabled for all arrays. A useful use case is to make a function `isCompatibleForReuseArray` return false if one of the value is not really an array but a tuple, e.g. `["tag", [...attributes], [...children]]]`. That way, it prevents a lot of comparisons.

Another useful option is:

    {findNextSimilar: (array: Array[A], element: A, fromIndex: Int) => (newIndex: Int | -1)}

It takes an array, an index from which it searches the element A, and return the first index at which it finds it. By default, the element must be exactly the same for an alignment to occur; but it might be useful to specify a function to find a partial match, especially if the match changed as well.

## Debugging edit actions

Tip: Use `bam.stringOf(...)` to convert an edit action to its string representation, or use `bam.debug(...)` to directly pretty-print an edit action to the standard output.

## Operations on edit actions

### Combination

    andThen(b, a)

is defined so that

    apply(b, apply(a, x)) == apply(andThen(b, a), x)

Note that `andThen` simplifies at the maximum the resulting edit action. If you do not want to simplify, use the equivalent:

    Sequence(a, b)

### Test commutativity

    commute(a, b)

returns true if we can guarantee that, for all x,

    apply(b, apply(a, x)) == apply(a, apply(b, x))


# Advanced: Language example

In this example, let us have a dummy program `{a: 1}` that an interpreted transforms into `{b: 1, c: 1}` in one step.
We are interested in how to propagates changes from the output back to the program.

1. First, we rewrite the interpreter so that it does not output the result anymore, it outputs a term in our Edit Action language (`evalStep`) that transforms the program to the result. This step is explained later in this README.
2. For example, `evalStep = New({b: Reuse("a"), c: Reuse("a")});`, meaning the `1` was cloned from field `a`.
3. A user modifies the output so that it becomes `{b: 2, c: {d: 1}}`.
4. Suppose that `userStep = nd.Reuse({b: nd.New(2), c: New({d: nd.or(nd.Reuse(), nd.Reuse("..", "b"))})});` is the edit action associated to this transformation.
   It encodes two possibilities: Either the 1 came from wrapping the field "c" (more likely) or was simply cloned from the field "b".
   "nd" stands for "non-deterministic", i.e. we can offer multiple variants. Using "nd" only makes sense for user steps.

We are interested to replicate the user step but on the program level. This library enables it in the following way:

    var program1 = {a: 1};
    var {Reuse, New, apply, backpropagate, nd, up} = bam;
    var evalStep = New({b: Reuse("a"), c: Reuse("a")});
    var output1 = apply(evalStep, program1);
    
    console.log(output1);       // Displays: {b: 1, c: 1}
    
    var userStep = nd.Reuse({b: nd.New(2), c: nd.New({d: nd.or(nd.Reuse(), nd.Reuse("..", "b"))})});
    var output2 = nd.apply(userStep, output1); // Applies the first variant.
    
    console.log(output2);       // Displays: {b: 2, c: {d: 1}}
    
    var userStepOnProgram = backpropagate(evalStep, userStep);
    
    console.log(userStepOnProgram);
                                // Displays: nd.Reuse({a: nd.New({d: nd.New(2)})})
    
    var program2 = nd.apply(userStepOnProgram, program1);
    
    console.log(program2);      // Displays: Reuse({a: {d: 2}})
    
    var output3 = apply(evalStep, program2); // You'd run the evaluator instead, in case some conditions changes...
    
    console.log(output3);       // Displays: {b: {d: 2}, c: {d: 2}}

This concludes a basic illustration of this API.

