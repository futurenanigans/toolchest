namespace Merkhet.Tests.Quality;

public class ErrorHandling
{
    public void Save(string s)
    {
        // ruleid: merk.quality.swallowed-error-csharp
        try
        {
            Persist(s);
        }
        catch { }
    }

    public void SaveNamed(string s)
    {
        // ruleid: merk.quality.swallowed-error-csharp
        try
        {
            Persist(s);
        }
        catch (System.Exception e) { }
    }

    public void SaveLogged(string s, ILogger logger)
    {
        // ok: merk.quality.swallowed-error-csharp
        try
        {
            Persist(s);
        }
        catch (System.Exception e)
        {
            logger.LogWarning(e, "Save failed for {Input}", s);
        }
    }

    private void Persist(string s) { }
}

public interface ILogger { void LogWarning(System.Exception e, string msg, params object[] args); }
