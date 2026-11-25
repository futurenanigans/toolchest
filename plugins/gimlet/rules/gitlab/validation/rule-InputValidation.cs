// License: MIT
using System.Web.Mvc;

public class CommentController : Controller
{
    // ruleid: csharp_validation_rule-InputValidation
    [ValidateInput(false)]
    public ActionResult Post(string body)
    {
        return View((object)body);
    }

    // ok: csharp_validation_rule-InputValidation
    [ValidateInput(true)]
    public ActionResult Preview(string body)
    {
        return View((object)body);
    }

    // ok: csharp_validation_rule-InputValidation
    [HttpPost]
    public ActionResult Save(string body)
    {
        return View((object)body);
    }
}
