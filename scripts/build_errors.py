"""Actionable diagnostics containing fixed messages, never raw config/SDK errors."""
import json


class BuildError(ValueError):
    def __init__(self, code, message, hint):
        super().__init__(message)
        self.code, self.hint = code, hint


def read_object(path, kind):
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
    except (json.JSONDecodeError, UnicodeError):
        raise BuildError('INVALID_JSON', f'{kind} is not valid UTF-8 JSON.', 'Correct JSON syntax; do not print credentials while diagnosing.') from None
    if not isinstance(value, dict):
        raise BuildError('INVALID_OBJECT', f'{kind} must be a JSON object.', 'Use the documented object schema, not an array or scalar.')
    return value


def diagnostic(exc):
    if isinstance(exc, BuildError):
        result = {'code': exc.code, 'message': str(exc), 'hint': exc.hint}
    elif isinstance(exc, OSError):
        result = {'code': 'FILE_IO', 'message': 'Cannot read or write a required file.', 'hint': 'Check input paths, output directory and permissions.', 'errno': exc.errno}
    else:
        result = {'code': 'INVALID_INPUT', 'message': 'Input does not match the documented data/spec schema.', 'hint': 'Check feature geometry, normalized fields and spec types; raw input is omitted.'}
    return json.dumps({'error': result}, ensure_ascii=False) + '\n'
