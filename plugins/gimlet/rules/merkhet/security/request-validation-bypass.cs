using System.Web.Mvc;

public class PostModel
{
    // ruleid: merk.security.allow-html-attribute-csharp
    [AllowHtml]
    public string Body { get; set; }

    // ok: merk.security.allow-html-attribute-csharp
    public string Title { get; set; }
}

public class PostsController : Controller
{
    // ruleid: merk.security.validate-input-false-csharp
    [ValidateInput(false)]
    [HttpPost]
    public ActionResult Edit(PostModel model)
    {
        // ruleid: merk.security.request-unvalidated-csharp
        var bypass = Request.Unvalidated["html"];

        // ruleid: merk.security.request-unvalidated-csharp
        var form = Request.Unvalidated.Form["body"];

        // ok: merk.security.request-unvalidated-csharp
        var safe = Request.Form["body"];

        return View();
    }

    // ok: merk.security.validate-input-false-csharp
    [HttpPost]
    public ActionResult Create(PostModel model)
    {
        return View();
    }
}
