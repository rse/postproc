
# postproc(1) -- Post-Process Output of Program

## SYNOPSIS

`postproc`
[`-C` *directory*]
[`-e` *rule*]
*program*
[*argument* ...]

## DESCRIPTION

`postproc`(1) is a small utility for flexibly post-processsing the
`stdout` and `stderr` outputs of a program. It applies one or more
post-processing rules to each line of output. Each rule can have zero or
more conditions and one or more actions. The conditions allow to match
the output line with the help of regular expressions or active tags. The
actions allow to change the output line with the help of replacement
strings, can add or delete active tags and can force the repeating or
stopping of the rules for the current line and can force the ignoring of
the current line.

## OPTIONS

The following command-line options and arguments exist:

- [`-C` *directory*]
  Change the current working *directory* before executing the *program*.

- [`-e` *rule*]
  Apply post-processing *rule* to `stdout` and `stderr` of *program*.
  The two outputs can be distinguished in the rules with the conditions
  `#stdout` and `#stderr`, based on the two initially defined tags.
  The option `-e` can be used multiple times to apply one or more rules.

- *program*:
  The program to execute.

- \[*argument* ...\]:
  Zero or more arguments passed to the program.

## RULE SYNTAX GRAMMAR

The following grammar specifies the supported syntax of a *rule*:

```
rule      ::= condition* ":" action+
condition ::= not? regex | not? tag
action    ::= string | not? tag | command
not       ::= "!"
regex     ::= "/" ("\\/" | .)* "/"
tag       ::= "#" /[a-zA-Z][a-zA-Z0-9]*
command   ::= "repeat" | "break" | "ignore"
string    ::= "\"" ("\\\"" | meta | .)* "\""
meta      ::= backref | function
backref   ::= "$" /[0-9]/
function  ::= "%" name ("(" arg? | (arg ("," arg)*) ")")?
name      ::= "c" | "t"
```

The conditions can be either a regular expression `regexp`, like `/foo.*?bar/`,
which has to (not) match on the current output line. Capture groups in the regular
expression are later available via back-references (`backref`) in the replacing `string`.

The arguments to the color function `%c()` can be any ANSI styles
supported by [ansi-styles](https://github.com/chalk/ansi-styles).
Examples are `red`, `bold`, `inverse` and `reset`. The arguments
to the timestamp function `%t()` can be any [time formatting
strings](https://momentjs.com/docs/#/displaying/) supported by
[moment.js](https://momentjs.com/). An example is `YYYY-MM-DD
hh:mm:ss.SS`.

The `repeat` command repeats the line processing from scratch by
starting from the first rule again. The `break` command stops the line
processing at the current rule by not executing the remaining rules. The
`ignore` command stops the line processing at the current rule by not
executing the remaining rules and ignores the line in the output at all.

## EXAMPLES

```
# adds timestamp prefix
$ postproc -e ': "[%c(blue)%t(YYYY-MM-DD hh:mm:ss.SS)%c(reset)] $0"' \
  npm install

# marks directories as blue
$ postproc -e '/^(d.+\s+)(\S+)$/ : "$1%c(blue)$2/%c(reset)"' \
  ls -l

# complex state-based marking of subsequent line
# postproc -e '/complete log/ : #logfile break' \
           -e '#logfile : "%c(bold)$0%c(reset)" !#logfile' \
  npm install not-existing-module
```

## HISTORY

The `postproc`(1) utility was developed in March 2020 to post-process
the log output of commands under control of supervisord(8). The main
intention was to prefix the outputs with timestamps and unique program
ids.

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

