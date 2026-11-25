using System.Web.Mvc;

public class PostModel
{
    // ruleid: gimlet.security.allow-html-attribute-csharp
    [AllowHtml]
    public string Body { get; set; }

    // ok: gimlet.security.allow-html-attribute-csharp
    public string Title { get; set; }
}

public class PostsController : Controller
{
    // ruleid: gimlet.security.validate-input-false-csharp
    [ValidateInput(false)]
    [HttpPost]
    public ActionResult Edit(PostModel model)
    {
        // ruleid: gimlet.security.request-unvalidated-csharp
        var bypass = Request.Unvalidated["html"];

        // ruleid: gimlet.security.request-unvalidated-csharp
        var form = Request.Unvalidated.Form["body"];

        // ok: gimlet.security.request-unvalidated-csharp
        var safe = Request.Form["body"];

        return View();
    }

    // ok: gimlet.security.validate-input-false-csharp
    [HttpPost]
    public ActionResult Create(PostModel model)
    {
        return View();
    }
}
