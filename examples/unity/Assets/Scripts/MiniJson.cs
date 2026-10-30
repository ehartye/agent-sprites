using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

// A small JSON reader. Unity's JsonUtility cannot tell an absent field from a false one (an atlas tag only carries
// "loop" when it was set) and cannot read objects keyed by name (expected.json keys frames by index), so the atlas
// loader and the check both read JSON into plain values with this instead:
//   object -> Dictionary<string, object>, array -> List<object>, number -> double, string, bool, null.
public static class MiniJson
{
    public static object Parse(string text)
    {
        var p = new Parser(text);
        p.SkipSpace();
        object value = p.ReadValue();
        p.SkipSpace();
        if (!p.AtEnd) throw p.Fail("unexpected text after the JSON value");
        return value;
    }

    public static Dictionary<string, object> Obj(object value, string what)
    {
        var o = value as Dictionary<string, object>;
        if (o == null) throw new FormatException(what + " must be a JSON object");
        return o;
    }

    public static List<object> Arr(object value, string what)
    {
        var a = value as List<object>;
        if (a == null) throw new FormatException(what + " must be a JSON array");
        return a;
    }

    public static object Field(Dictionary<string, object> o, string key, string what)
    {
        object v;
        if (!o.TryGetValue(key, out v)) throw new FormatException(what + " is missing \"" + key + "\"");
        return v;
    }

    public static int Int(object value, string what)
    {
        if (!(value is double)) throw new FormatException(what + " must be a number");
        double d = (double)value;
        if (d != Math.Floor(d) || Math.Abs(d) > int.MaxValue) throw new FormatException(what + " must be a whole number");
        return (int)d;
    }

    public static string Str(object value, string what)
    {
        var s = value as string;
        if (s == null) throw new FormatException(what + " must be a string");
        return s;
    }

    sealed class Parser
    {
        readonly string s;
        int i;
        public Parser(string text) { s = text; }
        public bool AtEnd { get { return i >= s.Length; } }

        public Exception Fail(string message) { return new FormatException("JSON: " + message + " at character " + i); }

        public void SkipSpace()
        {
            while (i < s.Length && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r' || s[i] == '\uFEFF')) i++;
        }

        public object ReadValue()
        {
            if (AtEnd) throw Fail("unexpected end");
            char c = s[i];
            if (c == '{') return ReadObject();
            if (c == '[') return ReadArray();
            if (c == '"') return ReadString();
            if (c == 't') { Expect("true"); return true; }
            if (c == 'f') { Expect("false"); return false; }
            if (c == 'n') { Expect("null"); return null; }
            return ReadNumber();
        }

        void Expect(string word)
        {
            if (string.CompareOrdinal(s, i, word, 0, word.Length) != 0) throw Fail("expected " + word);
            i += word.Length;
        }

        Dictionary<string, object> ReadObject()
        {
            var result = new Dictionary<string, object>();
            i++;
            SkipSpace();
            if (i < s.Length && s[i] == '}') { i++; return result; }
            while (true)
            {
                SkipSpace();
                if (AtEnd || s[i] != '"') throw Fail("expected a property name");
                string key = ReadString();
                SkipSpace();
                if (AtEnd || s[i] != ':') throw Fail("expected ':'");
                i++;
                SkipSpace();
                result[key] = ReadValue();
                SkipSpace();
                if (AtEnd) throw Fail("unterminated object");
                if (s[i] == ',') { i++; continue; }
                if (s[i] == '}') { i++; return result; }
                throw Fail("expected ',' or '}'");
            }
        }

        List<object> ReadArray()
        {
            var result = new List<object>();
            i++;
            SkipSpace();
            if (i < s.Length && s[i] == ']') { i++; return result; }
            while (true)
            {
                SkipSpace();
                result.Add(ReadValue());
                SkipSpace();
                if (AtEnd) throw Fail("unterminated array");
                if (s[i] == ',') { i++; continue; }
                if (s[i] == ']') { i++; return result; }
                throw Fail("expected ',' or ']'");
            }
        }

        string ReadString()
        {
            var sb = new StringBuilder();
            i++;
            while (true)
            {
                if (AtEnd) throw Fail("unterminated string");
                char c = s[i++];
                if (c == '"') return sb.ToString();
                if (c != '\\') { sb.Append(c); continue; }
                if (AtEnd) throw Fail("unterminated escape");
                char e = s[i++];
                switch (e)
                {
                    case '"': sb.Append('"'); break;
                    case '\\': sb.Append('\\'); break;
                    case '/': sb.Append('/'); break;
                    case 'b': sb.Append('\b'); break;
                    case 'f': sb.Append('\f'); break;
                    case 'n': sb.Append('\n'); break;
                    case 'r': sb.Append('\r'); break;
                    case 't': sb.Append('\t'); break;
                    case 'u':
                        if (i + 4 > s.Length) throw Fail("short unicode escape");
                        sb.Append((char)int.Parse(s.Substring(i, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
                        i += 4;
                        break;
                    default: throw Fail("bad escape");
                }
            }
        }

        double ReadNumber()
        {
            int start = i;
            while (i < s.Length && "+-0123456789.eE".IndexOf(s[i]) >= 0) i++;
            double d;
            if (i == start || !double.TryParse(s.Substring(start, i - start), NumberStyles.Float, CultureInfo.InvariantCulture, out d))
                throw Fail("expected a value");
            return d;
        }
    }
}
