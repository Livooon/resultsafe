from resultsafe import Result, Ok, map

result: Result[int, str] = Ok(1)
map(result, lambda value: value.nonexistent)
