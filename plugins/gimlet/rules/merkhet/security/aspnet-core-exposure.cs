// Fixture for aspnet-core-exposure.yml
// Tests: swagger-in-prod-csharp, developer-exception-page-in-prod-csharp

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
var app = builder.Build();

// ruleid: merk.security.swagger-in-prod-csharp
app.UseSwagger();

// ruleid: merk.security.swagger-in-prod-csharp
app.UseSwaggerUI();

// ruleid: merk.security.developer-exception-page-in-prod-csharp
app.UseDeveloperExceptionPage();

// ok: merk.security.swagger-in-prod-csharp, merk.security.swagger-in-prod-csharp, merk.security.developer-exception-page-in-prod-csharp
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.UseDeveloperExceptionPage();
}

// ok: merk.security.swagger-in-prod-csharp, merk.security.swagger-in-prod-csharp, merk.security.developer-exception-page-in-prod-csharp
if (env.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.UseDeveloperExceptionPage();
}

app.MapGet("/", () => "Hello World!");
app.Run();
