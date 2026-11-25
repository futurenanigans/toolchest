using System;
using System.IO;

namespace Merkhet.Tests.ErrorHandling;

public class RethrowExamples
{
    public void LosesStack()
    {
        // ruleid: merk.quality.rethrow-loses-stack-csharp
        try
        {
            DoWork();
        }
        catch (IOException ex)
        {
            LogError(ex);
            throw ex;
        }
    }

    public void PreservesStack()
    {
        // ok: merk.quality.rethrow-loses-stack-csharp
        try
        {
            DoWork();
        }
        catch (IOException ex)
        {
            LogError(ex);
            throw;
        }
    }

    public void WrapsWithInner()
    {
        // ok: merk.quality.rethrow-loses-stack-csharp
        try
        {
            DoWork();
        }
        catch (IOException ex)
        {
            throw new ApplicationException("processing failed", ex);
        }
    }

    private void DoWork() { }
    private void LogError(Exception e) { }
}

public class GeneralCatchExamples
{
    public int Defensive()
    {
        // ruleid: merk.quality.catch-general-exception-csharp
        try
        {
            return Compute();
        }
        catch (Exception e)
        {
            return -1;
        }
    }

    public int ReRaises()
    {
        // ok: merk.quality.catch-general-exception-csharp
        try
        {
            return Compute();
        }
        catch (Exception e)
        {
            Log(e);
            throw;
        }
    }

    public int Specific()
    {
        // ok: merk.quality.catch-general-exception-csharp
        try
        {
            return Compute();
        }
        catch (OverflowException e)
        {
            return int.MaxValue;
        }
    }

    private int Compute() => 0;
    private void Log(Exception e) { }
}
