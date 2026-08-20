from resultsafe import Ok, Result

result: Result[int, str] = Ok(1)
result.map(lambda value: value.nonexistent)
